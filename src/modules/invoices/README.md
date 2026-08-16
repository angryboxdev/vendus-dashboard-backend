# Módulo: invoices

> Status: ativo
> Última atualização: 2026-08-16 (classificationSummary em GetInvoice e ListInvoices; setInvoiceStatus via frontend)

---

## O que é e para que serve (perspectiva de negócio)

Todos os meses chegam dezenas de faturas à Angrybox — da Makro, da EDP, da NOS,
de plataformas de marketing, de fornecedores de embalagens. Sem um sistema, essas
faturas ficam em papel, em email ou numa pasta de computador, e o manager não sabe
ao certo o que deve, quando vence, nem quanto gastou por área.

**O problema que resolve:**
Perder uma fatura vencida significa juros ou interrupção de serviço. Não saber
o total de custos por centro de custo impede qualquer análise financeira. Este
módulo centraliza todas as faturas, automatiza a extração de dados via IA e dá
visibilidade sobre o estado de cada uma (rascunho IA, para rever, por pagar, paga, vencida).

**O fluxo do ponto de vista do negócio:**

```
Manager (backoffice)
────────────────────────────────────────────────────────────────
Fluxo de importação via IA:
1. Manager clica "Importar fatura" e envia PDF, JPG ou PNG
2. IA extrai: fornecedor, NIF, nº fatura, datas, valores, linhas
3. Sistema procura fornecedor por NIF no cadastro
   → Encontrado: aplica classificação padrão automaticamente
   → Não encontrado: marca como "aguardando resolução"
4. Fatura criada em estado "Rascunho IA"
5. Manager revê dados na tela de revisão, corrige se necessário
6. Manager salva (quatro opções):
   — "Salvar como pendente" → estado passa para Pendente
   — "Salvar e gerar conta a pagar" → estado Pendente + cria conta a pagar
   — "Fatura já paga" + data de pagamento → estado passa para Paga diretamente
   — "Débito direto" + data de débito → fica Pendente; cron processa na data e marca como Paga
7. Alertas de vencimento ficam ativos a partir daí

Fluxo manual:
1. Manager introduz a fatura manualmente
2. A fatura fica em estado "Pendente"
3. Manager decide o nível de detalhe das linhas:
   — Modo resumo (padrão): a fatura fica com uma linha automática que representa
     o total; a classificação é feita ao nível do cabeçalho (tipo + subcategoria)
   — Modo detalhado: manager activa o detalhamento e introduz cada linha
     individualmente (ex: "Farinha T55", "Embalagens", "MOD"); cada linha tem
     o seu próprio tipo e subcategoria de CC; o sistema verifica em tempo real
     se a soma das linhas bate com o total da fatura
   → em qualquer modo, se a subcategoria exigir canal (ex: MKT.05), seleciona
     também a plataforma (Uber Eats, Glovo…)
   → opcionalmente marca "Guardar como regra" para automatizar faturas futuras
4. Quando paga, regista a data → estado "Paga"
```

**Conceitos-chave para o negócio:**

- **Fatura** — documento emitido por um fornecedor com o valor a pagar e a data
  limite. Estados: *Rascunho IA*, *Pendente Revisão*, *Pendente* (por pagar),
  *Paga*, *Vencida*, *Parcial*, *Cancelada*, *Em revisão* (legado).
- **Importação inteligente** — fluxo onde o utilizador envia o documento original
  e a IA extrai automaticamente os dados. O utilizador apenas valida/corrige antes
  de confirmar.
- **Linha de fatura** — detalhe do que foi comprado/contratado. Cada fatura tem
  dois modos: *resumo* (uma linha automática igual ao total da fatura, suficiente
  para a maioria dos casos) e *detalhado* (o manager decompõe o valor em várias
  linhas com classificações independentes, útil quando uma fatura cobre despesas
  de diferentes áreas). O manager pode alternar entre modos a qualquer momento;
  ao voltar ao resumo, o detalhamento anterior é descartado.
- **Conferência de totais** — no modo detalhado, o sistema compara em tempo real
  a soma das linhas com o total da fatura. Enquanto os valores divergirem, o
  manager é alertado visualmente; a fatura só pode ser considerada válida quando
  os totais fecham (tolerância máxima: 0,01 €).
- **Regra de classificação** — por fornecedor e padrão de descrição (substring),
  memoriza subcategoria, tipo de linha e canal para faturas futuras. A regra mais
  longa que faz match vence; regra sem padrão serve de fallback genérico do fornecedor.
- **Débito direto** — modalidade de pagamento em que o fornecedor debita
  automaticamente a conta na data acordada. A fatura fica *Pendente* até essa
  data; um cron diário processa-a e marca-a como *Paga* sem intervenção manual.
- **Alertas de vencimento** — o módulo transforma faturas em ações operacionais:
  vencidas, a vencer hoje, nos próximos 7 dias, sem vencimento, sem fornecedor,
  baixa confiança IA, divergência de valores.

---

## Propósito técnico

Gestão de faturas de fornecedores: criação manual, importação via IA (PDF/imagem),
ciclo de vida (draft_ai → pending → paid/cancelled/overdue), classificação de linhas,
sugestão automática e alertas operacionais. Não é responsável por extratos bancários,
reconciliação ou relatórios financeiros.

## Conceitos do domínio

- **Invoice** — fatura com cabeçalho estendido. Imutável; métodos devolvem nova instância.
  - Campos: `supplierNifSnapshot`, `source`, `aiExtractionStatus`, `aiConfidence`,
    `requiresReview`, `costCenterGroupId`, `costCenterCategoryId`, `financialType`,
    `affectsDre`, `affectsCashflow`, `affectsProfitability`, `currency`,
    `isDirectDebit`, `directDebitDate`, `paymentBankAccountId`, `paymentMethod`, `paymentNotes`.
  - `costCenterCategoryId` ao nível da fatura propaga automaticamente para todas as
    linhas ao confirmar importação ou ao actualizar a fatura.
  - Factory `createFromImport()` para faturas criadas pelo fluxo IA.
  - Método `confirmImport()` para transitar `draft_ai` → `pending`.
- **InvoiceLine** — linha de detalhe. Imutável; métodos devolvem nova instância.
  - `classify()` / `classifyFromCategory()` — alteram tipo, subcategoria e canal.
  - `updateValues()` — altera valores de negócio (descrição, quantidade, unidade, preço unitário, IVA, total). Só permitido quando `invoice.lineDetailMode === "detailed"`.
  - Campos `financialType`, `affectsDre`, `affectsCashflow`,
  `affectsProfitability`, `requiresChannel` e `requiresAllocation` são herdados automaticamente
  da subcategoria ao classificar (`classifyFromCategory`). `channelId` é obrigatório quando
  `requiresChannel = true`. Dois campos calculados na DTO:
  - `dreValue = totalWithVat − vatAmount` — valor sem IVA, para DRE e Rentabilidade.
  - `cashflowValue = totalWithVat` — valor total com IVA, para Fluxo de Caixa.
- **ClassificationRule** — regra por `(supplierId, descriptionPattern)`. Múltiplas regras por
  fornecedor são suportadas; o match usa substring case-insensitive (padrão mais longo vence);
  regra sem padrão serve de fallback genérico. Inclui `channelId` para sugerir canal.
- **AiExtractionResult** — value object com os dados extraídos pela IA + confidence + validationIssues.
- **InvoiceStatus**: `draft_ai | pending_review | pending | paid | overdue | cancelled | review`
- **ReconciliationStatus**: `none | pending_reconciliation | reconciled` — estado bancário, ortogonal ao `InvoiceStatus`. Após `markPaid()` fica `pending_reconciliation`; passa a `reconciled` via `markReconciled()` ou conciliação bancária.
- **LineDetailMode**: `simple | detailed` — controla se a fatura usa linha única automática (derivada dos totais do cabeçalho, gerida pelo frontend) ou linhas reais persistidas e editáveis. Padrão: `simple`. Ao transitar para `simple`, todas as linhas são apagadas; ao transitar para `detailed`, parte de zero.
- **InvoiceSource**: `manual | pdf_import | image_import`
- Todos os valores monetários em **cêntimos** (inteiros).

## Ports

### Entrada (use cases)

- `CreateInvoiceUseCase` — criação manual com linhas opcionais; cria payable entry se dueDate presente.
- `UpdateInvoiceUseCase` — actualiza campos do cabeçalho (inclui novos campos de classificação financeira).
- `MarkInvoicePaidUseCase` — transita para `paid` + `reconciliationStatus=pending_reconciliation`; aceita `bankAccountId`, `paymentMethod` e `paymentNotes` opcionais; sincroniza payable entry.
- `MarkInvoiceReconciledUseCase` — transita `reconciliationStatus` de `pending_reconciliation` para `reconciled`. Requer fatura já paga.
- `SetInvoiceStatusUseCase` — força estado arbitrário; cancela payable entry se `cancelled`.
- `SetLineDetailModeUseCase` — alterna entre `simple` e `detailed`. Na transição `detailed → simple`, apaga todas as linhas da fatura (`deleteByInvoiceId`) — em modo simples a linha automática é derivada dos totais do cabeçalho, e linhas armazenadas ficariam ambíguas para analytics. A transição nunca é bloqueada por divergência de totais.
- `AddInvoiceLineUseCase` — adiciona linha a fatura existente (requer `lineDetailMode=detailed`).
- `UpdateInvoiceLineUseCase` — actualiza valores de uma linha existente (descrição, quantidade, unidade, preço unitário, IVA, total). Requer `lineDetailMode=detailed`. Valida que a soma das linhas não excede os totais da fatura (tolerância: 1 cêntimo).
- `ClassifyInvoiceLineUseCase` — classifica linha; quando `costCenterCategoryId` presente, herda automaticamente os campos da subcategoria via `CostCenterCategoryReaderPort`. Opcionalmente grava/actualiza `ClassificationRule` com `descriptionPattern` e `channelId`.
- `SuggestLineClassificationUseCase` — sugestão de classificação por `supplierId` + `description?`; retorna `channelId` quando presente na regra.
- `ListInvoicesUseCase` — filtra por fornecedor, CC, estado, intervalo de datas, `isDirectDebit`. Injeta `CostCenterCategoryReaderPort`; recolhe os `costCenterCategoryId` únicos de todas as faturas devolvidas, chama `findManyByIds` uma única vez e constrói o `categoryMap` passado a `toInvoiceDTO` — garante que `classificationSummary` tem `code` e `name` corretos mesmo na listagem.
- **`ProcessDirectDebitsUseCase`** — busca faturas de DD com `directDebitDate ≤ hoje` e status não pago/cancelado; marca-as como pagas na `directDebitDate` e sincroniza payable entries.
- `ListInvoiceLinesUseCase` — todas as linhas (para analytics por CC).
- `GetInvoiceUseCase` — detalhe com linhas. Inclui sempre `classificationSummary` (ver abaixo). Quando `lineDetailMode=detailed`, o DTO inclui também `linesSummary = { subtotalWithoutVat, totalVat, totalWithVat, totalsMismatch }` com tolerância de 1 cêntimo.
- `DeleteInvoiceUseCase` — remove fatura, linhas e ficheiro em storage (se tiver `attachmentUrl`).
- **`ImportInvoiceUseCase`** — armazena ficheiro, extrai dados via IA, procura fornecedor por NIF, aplica defaults, cria `Invoice` em `draft_ai`.
- **`ConfirmImportedInvoiceUseCase`** — aplica correções do utilizador, transita `draft_ai`/`pending_review` → `pending`; salva linhas opcionais; cria payable entry se pedido. Suporta `newSupplier` (cria fornecedor via `SupplierCreatePort` antes de guardar) e propaga `costCenterCategoryId` para todas as linhas.
- **`GetInvoiceAlertsUseCase`** — devolve contagens e valores para os 8 tipos de alerta.

### Saída (dependências do domínio)

- `InvoiceRepositoryPort` — CRUD de faturas + `findAll(filter?)` + `findPendingDirectDebits()`.
- `InvoiceLineRepositoryPort` — `saveAll`, `save`, `findByInvoiceId`, `findAll`, `updateLine`, `deleteByInvoiceId`, `updateCostCenterCategoryForInvoice` (bulk update do CC de todas as linhas).
- `ClassificationRuleRepositoryPort` — `findBySupplierId`, `findBySupplierIdAndDescription`, `save`, `update`.
- `CostCenterCategoryReaderPort` — `findById` (snapshot mínimo da subcategoria para herança; sem acoplamento ao módulo `financial-base`); `findManyByIds(ids)` (lookup batch para `classificationSummary` em `GetInvoice` e `ListInvoices`).
- `PayableEntryWritePort` — cria/marca-pago/cancela entradas em `payable_entries`.
- **`AiExtractionPort`** — `extract(fileUrl, mimeType): Promise<AiExtractionResult>`.
- **`DocumentStoragePort`** — `store(buffer, filename, mimeType): Promise<string>`.
- **`SupplierLookupPort`** — `findByNif(nif)` + `findByName(query)`. Inclui defaults do fornecedor.
- **`SupplierCreatePort`** — `create(data)` para criar fornecedor durante confirmação de importação.

## Adapters

### Entrada

- `createInvoiceRouter` → expõe use cases via REST em `/api/invoices`.

### Saída

- `SupabaseInvoiceRepository` → tabela `invoices` (actualizado com novos campos).
- `SupabaseInvoiceLineRepository` → tabela `invoice_lines`; inclui `updateCostCenterCategoryForInvoice`.
- **`FinancialBaseSupplierCreateAdapter`** → delega criação de fornecedor ao financial-base.
- `SupabaseClassificationRuleRepository` → tabela `classification_rules`.
- `SupabasePayableEntryWriteAdapter` → tabela `payable_entries`.
- **`SupabaseDocumentStorageAdapter`** → bucket Supabase Storage `invoice-documents`.
- **`SupabaseSupplierLookupAdapter`** → tabela `suppliers` (NIF + defaults).
- **`OpenAiExtractionAdapter`** → GPT-4o Vision, devolve JSON estruturado.

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/invoices/lines` | Todas as linhas (para analytics por CC) |
| GET | `/api/invoices` | Lista faturas (query: `supplierId`, `costCenterId`, `status`, `from`, `to`, `isDirectDebit`) |
| GET | `/api/invoices/alerts` | **Novo** — KPIs de alertas operacionais |
| GET | `/api/invoices/suggest-classification/:supplierId?description=...` | Sugestão de classificação (com match por descrição) |
| GET | `/api/invoices/:id` | Detalhe com linhas |
| POST | `/api/invoices` | Criar fatura manualmente (com linhas opcionais) |
| POST | `/api/invoices/import` | **Novo** — importar PDF/imagem via IA (multipart `file`) |
| POST | `/api/invoices/:id/confirm` | **Novo** — confirmar fatura importada |
| PATCH | `/api/invoices/:id` | Actualizar cabeçalho |
| PATCH | `/api/invoices/:id/paid` | Marcar como paga — body: `{ paidAt?, bankAccountId?, paymentMethod?, paymentNotes? }` |
| PATCH | `/api/invoices/:id/reconcile` | **Novo** — marcar como conciliada (requer `status=paid`) |
| PATCH | `/api/invoices/:id/line-detail-mode` | **Novo** — alternar modo de linhas — body: `{ mode: "simple"|"detailed" }` |
| PATCH | `/api/invoices/:id/status` | Forçar estado |
| DELETE | `/api/invoices/:id` | Eliminar fatura e linhas |
| POST | `/api/invoices/:invoiceId/lines` | Adicionar linha a fatura existente |
| PATCH | `/api/invoices/:invoiceId/lines/:lineId` | Editar valores de uma linha (requer `lineDetailMode=detailed`) |
| PATCH | `/api/invoices/:invoiceId/lines/:lineId/classify` | Classificar linha |
| POST | `/api/invoices/process-direct-debits` | Processar débitos diretos vencidos (manager+) |
| POST | `/api/internal/cron/process-direct-debits` | Idem, via cron (Bearer `CRON_SECRET`) |

## Decisões de design

- **Upload multipart no controller, não no use case**: o controller faz a leitura do buffer (`multer`) e passa-o ao `ImportInvoiceUseCase`. O domínio nunca toca em `Buffer` — só vê `DocumentStoragePort` e `AiExtractionPort` como interfaces.
- **AI extraction via base64, não URL público**: o `OpenAiExtractionAdapter` armazena primeiro o ficheiro no Supabase Storage, lê o buffer e envia-o como `data:<mimeType>;base64,...` diretamente à API GPT-4o Vision. Nenhum URL público é partilhado com a OpenAI.
- **Linhas de fatura opcionais no import**: o MVP regista sempre os totais da fatura. As linhas são salvas durante `confirmImport` se o utilizador as fornecer. Não é necessário ter linhas para que a fatura seja válida.
- **Criação de fornecedor durante confirmação**: `ConfirmImportedInvoiceUseCase` aceita o campo `newSupplier` (nome + NIF opcional). Quando presente, chama `SupplierCreatePort.create()` e usa o ID retornado — `newSupplier` tem precedência sobre `supplierId`. O adapter concreto (`FinancialBaseSupplierCreateAdapter`) delega ao módulo `financial-base`. A consulta de fornecedor existente por NIF é feita via `SupplierLookupPort`.
- **`confirmImport` transita para `pending`, `paid` ou `pending` com DD**: se "Fatura já paga" → `paid`; se "Débito direto" → `pending` com `isDirectDebit=true` e `directDebitDate`; caso contrário `pending`.
- **Débito direto e "já paga" são mutuamente exclusivos**: o frontend impede selecionar ambos; o backend aceita `isDirectDebit` independentemente de `markAsPaid`, mas a semântica esperada é exclusiva.
- **Débito direto não cria payable entry**: quando o utilizador confirma uma fatura com `isDirectDebit=true`, o `saveAsPayable` é forçado a `false` no frontend e ignorado no backend — não faz sentido ter uma entrada a pagar para algo que será debitado automaticamente. O processamento do cron sincroniza o payable entry existente (se houver) via `markPaidByInvoiceId`.
- **Processamento de DD via cron**: `ProcessDirectDebitsUseCase` lê faturas com `directDebitDate ≤ hoje` e status não pago/cancelado (`paid`/`cancelled` excluídos; `overdue` é elegível), marca-as como pagas na `directDebitDate` e sincroniza o payable entry.
- **`internalCronRoutes` como factory**: o ficheiro `src/routes/internalCronRoutes.ts` exporta `createInternalCronRouter(deps)` em vez de uma instância singleton. Isto evita que o módulo `invoices` seja instanciado duas vezes (uma no `server.ts` e outra na criação das rotas cron), o que criaria dois clientes Supabase separados. O `server.ts` passa `{ processDirectDebits: invoicesModule.processDirectDebits }` já instanciado.
- **Proteção contra duplicados — dois caminhos distintos**:
  - Criação manual: `findDuplicate(invoiceNumber, supplierId)` — só actua quando o fornecedor está ligado.
  - Import/Confirm: `findDuplicateByNif(invoiceNumber, supplierNifSnapshot)` — usa o NIF extraído pela IA porque o `supplierId` pode ainda não estar resolvido na tela de revisão.
  - Na importação é um aviso (`validationIssues: ["duplicate_invoice"]`); na confirmação é um erro que bloqueia (409 `DuplicateInvoiceError`).
- **Novos campos com defaults seguros**: todos os campos novos têm defaults que preservam comportamento dos registos existentes (`source: "manual"`, `affectsDre: true`, `affectsCashflow: true`, `affectsProfitability: false`, `currency: "EUR"`, `requiresReview: false`).
- **Sem OCR custom**: usamos o modelo de visão da OpenAI. `confidenceBoost` das regras de classificação e o campo `aiConfidence` são escalas independentes.
- **PDFs convertidos a PNG antes do Vision API**: a OpenAI Vision API não aceita `data:application/pdf;base64,...` como `image_url`. O `OpenAiExtractionAdapter` usa `pdf-to-img` (já no projeto) para renderizar cada página a PNG com `scale: 2` e envia-as como múltiplos `image_url` no mesmo request. Faturas multi-página são suportadas. O fluxo de imagens mantém-se intacto e não é afetado.
- **`reconciliationStatus` ortogonal ao `status`**: `status=paid` continua a ser o estado documental/operacional de paga (usado em filtros, listas, alertas de vencimento). `reconciliationStatus` rastreia a confirmação bancária e é independente. Ambos os campos existem em simultâneo sem conflito. Faturas anteriores à migration ficam com `reconciliationStatus=none` (neutro).
- **`lineDetailMode=simple` bloqueia `AddInvoiceLineUseCase`**: em modo simples, a fatura tem uma linha única automática (gerida pelo frontend). Tentar adicionar uma linha via API com `lineDetailMode=simple` retorna 422. Para ativar o detalhamento, o utilizador usa `PATCH /invoices/:id/line-detail-mode` com `{ mode: "detailed" }`.
- **`linesSummary` no `InvoiceDTO`**: quando `lineDetailMode=detailed` e as linhas são carregadas (`GetInvoice`), o DTO inclui `linesSummary = { subtotalWithoutVat, totalVat, totalWithVat, totalsMismatch }`. O campo `totalsMismatch: true` sinaliza ao frontend divergência entre linhas e totais da fatura. Tolerância: 1 cêntimo por campo.
- **`classificationSummary` no `InvoiceDTO`** (campo obrigatório): derivado em `toInvoiceDTO` via `computeClassificationSummary`. Três modos:
  - `"unique"` — todas as linhas (ou a fatura em modo simples) partilham a mesma subcategoria. `entries` tem um elemento.
  - `"mixed"` — linhas com subcategorias diferentes (só possível em `lineDetailMode=detailed`). `entries` tem N elementos com o total acumulado de cada subcategoria.
  - `"none"` — nenhuma linha classificada e nenhuma categoria ao nível da fatura.
  - Fallback: quando `lineDetailMode=detailed` mas não há linhas carregadas (ex: listagem), usa `invoice.costCenterCategoryId` se existir.
  - Em `GetInvoice`, o `categoryMap` é construído com `findManyByIds` sobre os IDs únicos das linhas + cabeçalho. Em `ListInvoices`, o `categoryMap` cobre apenas o `costCenterCategoryId` do cabeçalho (sem linhas na listagem).
- **Transição `detailed → simple` descarta linhas**: `SetLineDetailModeUseCase` apaga todas as linhas ao voltar para `simple`. Em modo simples, a linha automática deriva dos totais do cabeçalho da fatura; linhas persistidas seriam ambíguas para analytics. A transição nunca é bloqueada — o utilizador pode regressar a `simple` a qualquer momento e recomeçar o detalhamento depois.
- **Modo determina a fonte para analytics**: em modo `simple`, não há linhas armazenadas — a fatura contribui para DRE/cashflow/rentabilidade através dos campos do cabeçalho (`costCenterCategoryId`, `financialType`, `affectsDre`, `affectsCashflow`, `affectsProfitability`). Em modo `detailed`, as linhas individuais são a fonte; cada linha herda os campos financeiros da sua subcategoria ao ser classificada. `ListInvoiceLinesUseCase` devolve todas as linhas persistidas — que, por definição, são apenas de faturas em `detailed` (faturas em `simple` não têm linhas).
- **Validação de totais de linhas (modo detalhado)**: ao adicionar ou editar uma linha, a soma das linhas (com os novos valores) não pode exceder os totais da fatura — `totalWithVat`, `totalVat` e `subtotalWithoutVat` — com tolerância de 1 cêntimo. Somas parciais abaixo do total são permitidas (utilizador pode adicionar linhas incrementalmente). Esta validação aplica-se a `AddInvoiceLineUseCase` e `UpdateInvoiceLineUseCase`.

## SQL — alterações às tabelas

```sql
-- Reconciliação e modo de linhas (migration: docs/migrations/invoices-reconciliation-and-line-mode.sql)
alter table invoices
  add column if not exists reconciliation_status text not null default 'none'
    check (reconciliation_status in ('none', 'pending_reconciliation', 'reconciled')),
  add column if not exists payment_bank_account_id uuid,
  add column if not exists line_detail_mode text not null default 'simple'
    check (line_detail_mode in ('simple', 'detailed')),
  add column if not exists competence_date date;

-- Método e notas de pagamento (migration: docs/migrations/invoices-payment-method-notes.sql)
alter table invoices
  add column if not exists payment_method text,
  add column if not exists payment_notes text;

create index if not exists idx_invoices_reconciliation_status on invoices (reconciliation_status);

-- Débito direto (migration: docs/migrations/invoices-direct-debit.sql)
alter table invoices
  add column if not exists is_direct_debit boolean not null default false,
  add column if not exists direct_debit_date date;

-- Colunas anteriores em invoices
alter table invoices
  add column if not exists supplier_nif_snapshot text,
  add column if not exists source text not null default 'manual',
  add column if not exists ai_extraction_status text,
  add column if not exists ai_confidence numeric,
  add column if not exists requires_review boolean not null default false,
  add column if not exists cost_center_group_id uuid references cost_center_groups(id) on delete set null,
  add column if not exists financial_type text,
  add column if not exists affects_dre boolean not null default true,
  add column if not exists affects_cashflow boolean not null default true,
  add column if not exists affects_profitability boolean not null default false,
  add column if not exists currency text not null default 'EUR';

-- Novas colunas em invoice_lines
alter table invoice_lines
  add column if not exists affects_dre boolean not null default true,
  add column if not exists affects_cashflow boolean not null default true,
  add column if not exists affects_profitability boolean not null default false;

-- Novas colunas em suppliers (necessárias para SupplierLookupAdapter)
alter table suppliers
  add column if not exists default_cost_center_group_id uuid references cost_center_groups(id) on delete set null,
  add column if not exists default_cost_center_category_id uuid references cost_center_categories(id) on delete set null,
  add column if not exists default_financial_type text;

-- Bucket Supabase Storage
-- Criar bucket "invoice-documents" com acesso público no painel Supabase Storage.
```

## Como testar

- Domínio/use cases: `npx jest --testPathPattern="src/modules/invoices" --no-coverage`
- Adapters: integração com Supabase (requer env vars `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`).

## Alertas operacionais (GetInvoiceAlertsUseCase)

`GET /api/invoices/alerts` devolve:

| Campo | Significado |
|---|---|
| `overdue` | Faturas vencidas e não pagas |
| `dueToday` | Faturas a vencer hoje e não pagas |
| `dueIn7Days` | Faturas a vencer nos próximos 7 dias e não pagas |
| `pendingReconciliation` | **Novo** — faturas pagas aguardando confirmação bancária |
| `noDueDateCount` | Faturas sem data de vencimento |
| `noSupplierCount` | Faturas sem fornecedor |
| `pendingReviewCount` | Faturas para rever (draft_ai, pending_review, requires_review) |
| `lowAiConfidenceCount` | Faturas com baixa confiança IA |
| `valueDiscrepancyCount` | Faturas com subtotal+IVA ≠ total |

## Pontos de atenção / dívidas conhecidas

- `suppliers` precisa das colunas `default_cost_center_group_id`, `default_cost_center_category_id`, `default_financial_type` para o fluxo de aplicação de defaults funcionar.
- `stock_item_id` e `stock_entry_id` nas linhas estão preparados para o módulo `stock-valuation`.
- `cost_center_id` (legado) ainda existe nas tabelas `invoice_lines` e `classification_rules`. Remover após confirmação de que nenhum dado activo depende dele.
- `ListInvoiceLinesUseCase` devolve todas as linhas sem paginação.
- Importação automática por email não implementada (fora do scope do MVP).
- Seed de regras built-in para Uber Eats/Glovo/Bolt adiado: requer UUIDs dos fornecedores
  reais na base de dados, que não existem em tempo de migration. As regras criam-se
  organicamente quando o utilizador classifica a primeira fatura e clica "Guardar como regra".
