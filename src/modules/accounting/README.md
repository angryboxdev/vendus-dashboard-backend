# Module: accounting

> Status: active
> Last updated: 2026-09-28

---

## O que é e para que serve (perspectiva de negócio)

Todos os meses a Angrybox tem de organizar as suas faturas/notas de crédito
(já geridas no módulo `invoices`), apurar o IVA do período e enviar tudo ao
contabilista. Nem toda a despesa passa pela conta/cartão/caixa da empresa:
às vezes um sócio ou funcionário adianta dinheiro do próprio bolso, uma
plataforma de delivery desconta uma comissão, ou é preciso lançar uma nota
de crédito, um documento manual ou uma regularização fora do fluxo normal
de faturas a pagar — essas situações também têm de ser contabilizadas e o
seu IVA controlado.

**O problema que resolve:**
Sem este módulo, esse tipo de documento fica solto em email/papel, sem
classificação nem controlo de IVA; o apuramento periódico de IVA é feito
manualmente a partir de faturas espalhadas; e não há histórico de quem
alterou o quê nem de que ficheiro original corresponde a cada documento.

**O fluxo do ponto de vista do negócio:**

```
Manager (backoffice)
────────────────────────────────────────────────────────────
1. Surge um documento sem o fluxo bancário normal da empresa
   (sócio/funcionário paga do próprio bolso, comissão de
   plataforma, nota de crédito avulsa, documento manual,
   regularização, outro)
2. Manager regista um "Documento" — tipo, origem dos fundos,
   quem emitiu, quanto, como vai ser tratado (reembolso/conta
   corrente/outro) — o sistema avisa se parecer duplicado de
   algo já registado (aqui ou em Faturas)
3. Manager classifica a dedutibilidade de IVA (ou aceita a
   sugestão da subcategoria de centro de custo) — se divergir,
   tem de justificar
4. Manager valida o documento quando confirma que está correto,
   ou marca-o "com pendência" se faltar algo
5. "Documentos" mostra, numa só lista, as faturas normais (só
   leitura, o módulo Faturas continua a ser onde se editam) +
   os Documentos deste módulo
6. "Apuramento de IVA" mostra o IVA liquidado (vendas), dedutível
   e não-dedutível (compras), por período (mês ou trimestre,
   conforme a configuração da organização) — sempre a
   acompanhar, ainda sem fecho formal
```

**Conceitos-chave para o negócio:**

- **Documento** — qualquer documento contabilístico/fiscal sem o fluxo
  bancário normal da empresa (nunca uma fatura normal — isso continua só
  em `invoices`). Tipos: fatura paga por sócio, fatura paga por
  funcionário, comissão de plataforma, nota de crédito, documento manual,
  regularização, outro.
- **Origem dos fundos** — de onde veio o dinheiro (sócio/funcionário/
  plataforma/outro); nunca "conta bancária/cartão/caixa da empresa" —
  isso é sempre uma Fatura.
- **IVA dedutível / não dedutível** — a subcategoria de centro de custo
  (`financial-base`) só **sugere** (100% ou 0%); o gestor pode divergir
  com uma percentagem explícita, mas tem sempre de justificar. Nunca uma
  regra fiscal calculada automaticamente por este módulo.
- **Documentos (vista agregada)** — nunca um CRUD paralelo de faturas;
  junta, só em leitura, o que já existe em `invoices` com os Documentos
  genuinamente novos aqui.
- **Periodicidade de IVA** — mensal ou trimestral, configurável por
  organização (não hardcoded).

---

## Propósito técnico

CRUD de `AccountingDocument` (com deteção de duplicados contra `invoices` e
contra si próprio, anexo original versionado, auditoria e transições de
estado), uma vista agregada de documentos (leitura de `invoices` +
`AccountingDocument`), e o "Apuramento de IVA" por período configurável
(agrega `vendus` + `invoices` + `financial-base`, nunca recalcula o que
esses módulos já calculam). **Não é responsabilidade deste módulo nesta
fase**: fecho formal do período/"crédito transportado" (precisa de um
conceito de fecho definitivo que ainda não existe), geração de ZIP/envio ao
contabilista ("Envios", placeholder no frontend), multi-linha por Documento
(1 documento = 1 tratamento fiscal ao nível do cabeçalho).

## Domain concepts

- **`AccountingDocument`** — entidade imutável. `create()` começa sempre em
  `status: "pending_review"`; `validate()`/`markWithPendency()`/`cancel(reason)`
  são as únicas transições de estado (nunca hard delete — `cancel` exige
  sempre motivo). `documentType`/`fundingSource`/`settlementMethod` são
  enums fechados, validados no `create()`/`update()`. `deductiblePercentage`
  é `null` por omissão (usa a sugestão da subcategoria); um valor explícito
  exige sempre `deductibilityOverrideReason` (mesma regra espelhada em
  `invoice_lines`, ver `invoices/domain/entities/invoice-line.ts`).
- **`vat-period.service.ts`** (`getVatPeriodRange`/`currentVatPeriod`/
  `periodsInYear`) — generaliza trimestre fiscal (sempre trimestre de
  calendário) e mês para um único conceito de "período de IVA", conforme a
  periodicidade configurada; funções puras, sem infraestrutura.

## Ports

### Input (use cases)

- `CreateAccountingDocumentPort`/`UpdateAccountingDocumentPort`/
  `GetAccountingDocumentPort` — CRUD do Documento. Create/Update lançam
  `PossibleDuplicateDocumentError` (409 no controller) quando encontram um
  candidato por NIF+número+data+total — `confirmDuplicate: true` força a
  operação.
- `ValidateAccountingDocumentPort`/`MarkAccountingDocumentPendencyPort`/
  `CancelAccountingDocumentPort` — transições de estado, todas com
  auditoria.
- `UploadAccountingDocumentAttachmentPort` — endpoint próprio (multipart),
  cada upload cria uma versão nova (hash SHA-256), nunca substitui a
  anterior.
- `ListAccountingDocumentsPort` — "Documentos": agrega `invoices` (via
  `ListInvoicesPort`, D10) + `AccountingDocument`. Nunca escreve, nunca
  duplica a lógica de faturas.
- `GetVatOverviewPort` — "Apuramento de IVA" (acompanhamento, sem fecho
  nesta fase). Cruza `SalesVatReadPort` (vendas, via `vendus`) +
  `ListInvoiceLinesPort`/`ListInvoicesPort` (compras, via `invoices`,
  incluindo o override de dedutibilidade por linha) +
  `ListCostCenterCategoriesPort` (sugestão de dedutibilidade, via
  `financial-base`) + `AccountingDocumentRepositoryPort` (Documentos, que
  entram nos totais gerais e no drill-down mas nunca no breakdown por
  taxa — não têm uma única taxa de IVA associada de forma fidedigna).
  Periodicidade vem de `AccountingSettingsRepositoryPort`.
- `GetAccountingSettingsPort`/`UpdateAccountingSettingsPort` —
  periodicidade de IVA (mensal/trimestral) por organização.

### Output (domain dependencies)

- `AccountingDocumentRepositoryPort` — persistência de `AccountingDocument`
  + `findPossibleDuplicate` (deteção de duplicados).
- `AccountingDocumentAttachmentRepositoryPort` — anexos versionados (nunca
  substitui uma versão anterior).
- `AccountingAuditLogPort` — mirror exato de `HrAuditLogPort` (módulo
  `hr`): `record`/`findByEntityId`, fire-and-forget (uma falha ao gravar
  auditoria nunca propaga para o use case).
- `AccountingSettingsRepositoryPort` — periodicidade de IVA por
  organização, default `quarterly` quando não há linha gravada.
- `AccountingDocumentStoragePort` — mirror exato de `HrFileStoragePort`:
  privado, URL sempre assinada on-demand, nunca pública (ao contrário de
  `invoices`, que usa URL pública hoje).
- `SalesVatReadPort` — porta fina e própria deste módulo (DTO em
  cêntimos), implementada por `VendusSalesVatReadAdapter`, que faz a ponte
  para o `GetSummaryPort` do módulo `vendus` (D10) e converte euros →
  cêntimos.
- **Portas de outros módulos injetadas diretamente, sem adapter de
  tradução** (D10): `ListInvoicesPort`/`ListInvoiceLinesPort` (`invoices`),
  `ListCostCenterCategoriesPort` (`financial-base`) — os DTOs já são
  exatamente o que este módulo precisa.

## Adapters

### Input

- `AccountingController` → `/api/accounting/*`, `requireMinRole("manager")`
  aplicado no mount (`server.ts`), mesmo padrão de `financial-base`/
  `invoices`. Upload de anexo via `multer` (memory storage, 20 MB, PDF/
  JPG/PNG). Os 4 níveis de permissão pedidos pela task (consulta/operador/
  revisor/administrador) mapeiam para os 3 papéis já existentes do
  sistema (`hr_viewer|manager|admin`) — decisão confirmada com o
  utilizador, ver `docs/adr/` se o cross-cutting crescer.

### Output

- `SupabaseAccountingDocumentRepository` → `accounting_documents` via
  `createScopedQuery` (D2).
- `SupabaseAccountingDocumentAttachmentRepository` → `accounting_document_attachments`.
- `SupabaseAccountingAuditLogAdapter` → `accounting_audit_logs`.
- `SupabaseAccountingSettingsRepository` → `accounting_settings` (1 linha
  por organização).
- `SupabaseAccountingDocumentStorageAdapter` → bucket `accounting-documents`
  (privado), via `objectStorage` (nunca guarda um `SupabaseClient`
  diretamente — D10/D17).
- `VendusSalesVatReadAdapter` → ponte para `vendus`'s `GetSummaryPort`.

## Design decisions (ADR summary)

### "IVA não dedutível" nunca é uma regra fiscal automática, mesmo com override

A subcategoria de centro de custo (`cost_center_categories.vat_deductible`)
só sugere; um `deductiblePercentage` explícito (por Documento ou por linha
de fatura) tem sempre prioridade, mas exige sempre motivo — nunca decidido
sozinho por este módulo. Uma linha/documento sem classificação conta como
dedutível por omissão, para nunca desaparecer silenciosamente do saldo.

### "Documentos" é uma vista agregada, nunca um CRUD paralelo de faturas

Decisão confirmada com o utilizador: faturas e notas de crédito pagas pela
conta/cartão/caixa da empresa continuam a criar-se/editar-se
exclusivamente no módulo `invoices`. Este módulo só lê essas faturas (via
`ListInvoicesPort`) e junta o único tipo de documento genuinamente novo —
o `AccountingDocument`.

### Deteção de duplicados cruza `AccountingDocument` e `invoices`

Cruza NIF+número+data+total contra os dois repositórios (D10, sem
duplicar a lógica de faturas). Um candidato encontrado bloqueia a
operação com `PossibleDuplicateDocumentError` (409); `confirmDuplicate: true`
força a criação/atualização mesmo assim — nunca bloqueia silenciosamente
nem decide sozinho que é ou não duplicado.

### Anexo original é sempre versionado, nunca substituído

Cada upload cria uma linha nova em `accounting_document_attachments` (hash
SHA-256 + versão incremental) — o "documento original" nunca se perde
silenciosamente, mesmo que o utilizador envie um ficheiro errado por
engano.

### Periodicidade de IVA é configuração da organização, nunca hardcoded

Generaliza o trimestre fixo inicial para mensal/trimestral, gravado em
`accounting_settings` (1 linha por organização, default `quarterly`).
`GetVatOverviewUseCase` lê sempre essa configuração — nunca assume o
trimestre.

### Documentos entram nos totais de IVA mas não no breakdown por taxa

Mesma razão da Fase 1: um `AccountingDocument` não tem um campo `vatRate`
— só um `vatAmount` já consolidado, tipicamente sem uma única taxa "limpa"
associada. O seu IVA soma-se aos totais gerais (dedutível/não-dedutível) e
aparece no drill-down por documento, mas fica de fora da tabela "por
taxa" — uma omissão deliberada, documentada, não um esquecimento.

### `VendusSalesVatReadAdapter` converte euros → cêntimos

O módulo `vendus` devolve valores em euros (floats, `round2`); todos os
módulos financeiros deste sistema trabalham em cêntimos (inteiros). A
conversão acontece só neste adapter, nunca no use case.

### Upload de anexo é um endpoint próprio, não parte do create/update

Mesmo padrão do `hr` — mais simples de fazer via `multipart/form-data` no
Express do que embutir um buffer num payload JSON.

## Como testar

- Domínio/use cases: `npx jest src/modules/accounting` (fakes para todas
  as portas de saída, incluindo as de outros módulos — vivem em
  `__tests__/fakes/`, não nos módulos de origem).
- `GetVatOverviewUseCase` tem o conjunto de testes mais crítico: separa
  dedutível/não-dedutível (categoria e override por linha), subtrai
  notas de crédito, ignora documentos/faturas cancelados, nunca mistura
  Documentos no breakdown por taxa, respeita a periodicidade configurada.
- `CreateAccountingDocumentUseCase`/`UpdateAccountingDocumentUseCase`
  cobrem a deteção de duplicados (contra si próprio e contra `invoices`).
- Override de dedutibilidade por linha de fatura: ver
  `invoices/__tests__/domain/invoice-line.test.ts` e
  `invoices/__tests__/use-cases/set-invoice-line-deductibility-override.test.ts`.

## Known gaps / open debt

- Sem bulk actions/paginação em `ListAccountingDocumentsPort` — volume
  esperado é baixo, reavaliar se isso deixar de ser verdade.
- Fecho de período (bloqueadores + snapshot, mesmo padrão de
  `MonthlyClosure` do `hr`) e "crédito transportado" ficam por fazer —
  precisam de um conceito de fecho definitivo que ainda não existe;
  mostrar isso sem um fecho real seria inventar um número.
- "Envios" (ZIP + envio manual ao contabilista) é só placeholder no
  frontend nesta ronda.
- Os 4 níveis de permissão da task (consulta/operador/revisor/
  administrador) mapeiam para os 3 papéis já existentes — se no futuro for
  preciso distinguir operador de revisor de facto, é um trabalho
  cross-cutting no sistema de autenticação, fora do âmbito deste módulo.
