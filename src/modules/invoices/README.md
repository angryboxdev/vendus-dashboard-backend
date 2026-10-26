# Módulo: invoices

> Status: ativo
> Última atualização: 2026-10-26 (QR em vetor noutras páginas e vários por página; linhas da IA conferidas com o QR; fornecedor por dica/nome com NIF ≠ QR recusado; documento de pagamento → uma fatura por QR com `payment_group_id`; associação automática à recorrência ao lançar — ADR-0041)

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
   → manager pode editar ou eliminar qualquer linha individualmente enquanto
     os totais não fecharem
   → em qualquer modo, se a subcategoria exigir canal (ex: MKT.05), seleciona
     também a plataforma (Uber Eats, Glovo…)
   → opcionalmente marca "Guardar como regra" para automatizar faturas futuras
4. Se necessário, o manager pode corrigir o número da fatura directamente no
   drawer — o sistema valida duplicados e propaga o novo número à conta a pagar
   e aos registos de conciliação bancária associados
5. Quando paga, regista a data → estado "Paga"
6. Ao eliminar uma fatura: o sistema cancela automaticamente a conta a pagar
   associada e remove os vínculos de conciliação bancária, actualizando o estado
   dos movimentos bancários afectados — sem intervenção manual adicional
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
  de diferentes áreas). Em modo detalhado cada linha pode ser editada (descrição,
  quantidade, preço, IVA, tipo, subcategoria de CC) ou eliminada individualmente.
  O manager pode alternar entre modos a qualquer momento; ao voltar ao resumo,
  o detalhamento anterior é descartado.
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
- **Número de fatura editável** — o manager pode corrigir o número directamente
  no drawer de detalhe; o sistema verifica duplicados e actualiza automaticamente
  a descrição da conta a pagar e os rótulos dos vínculos de conciliação bancária.

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
- **InvoiceStatus**: `draft_ai | pending_review | pending | paid | overdue | cancelled | review`.
  `overdue` existe como valor do enum e a entidade tem `markOverdue()`, mas
  **nada no sistema chama esse método** — não há cron nem trigger que
  transite uma fatura para `overdue` automaticamente. Na prática nenhuma
  fatura fica persistida com este status literal; é sempre calculado
  on-the-fly (não paga/cancelada/rascunho + `dueDate` no passado — ver
  `GetInvoiceAlertsUseCase` e `ListInvoicesUseCase`). Filtrar a listagem por
  `status=overdue` teria de ser tratado como filtro derivado, nunca como
  igualdade literal no repositório (bug corrigido, ver "Decisões de
  design").
- **ReconciliationStatus**: `none | pending_reconciliation | reconciled` — estado bancário, ortogonal ao `InvoiceStatus`. Após `markPaid()` fica `pending_reconciliation`; passa a `reconciled` via `markReconciled()` ou conciliação bancária.
- **LineDetailMode**: `simple | detailed` — controla se a fatura usa linha única automática (derivada dos totais do cabeçalho, gerida pelo frontend) ou linhas reais persistidas e editáveis. Padrão: `simple`. Ao transitar para `simple`, todas as linhas são apagadas; ao transitar para `detailed`, parte de zero.
- **InvoiceSource**: `manual | pdf_import | image_import`
- Todos os valores monetários em **cêntimos** (inteiros).

## Ports

Spec B2 (ticket 10, ADR-0008): **todas as portas de entrada e saída recebem a
organização como parâmetro explícito** — um `OrganizationId` (tipo nominal de
`src/kernel/organization-id.ts`). Nos comandos-objeto é o campo
`organizationId`; nas portas cujo `execute` já tomava argumentos primitivos
(`GetInvoicePort`, `ListInvoicesPort`, `ListInvoiceLinesPort`,
`DeleteInvoicePort`, `DeleteInvoiceLinePort`, `SuggestLineClassificationPort`,
`GetInvoiceAlertsPort`, `ProcessDirectDebitsPort`), é o novo primeiro
parâmetro posicional. O controller lê-o de `req.auth.orgId` (claim
verificada); o cron de débitos diretos, que não tem pedido, chama
`ProcessDirectDebitsPort.execute()` uma vez por organização — spec C ticket
06 substituiu o `UNATTENDED_SCOPE` fixo por um fan-out sobre
`listOrganizations()` (`src/infra/scoped-db/organization-listing.ts`, ticket
02), ver "Processamento de DD via cron" abaixo. Excepção deliberada:
`AiExtractionPort` não toma organização — nunca toca a base de dados (a IA
é discutida em "Decisões de design"). `DocumentStoragePort` passou a tomar
`organizationId` (ADR-0015, ticket 03 de `kiosk-pin-storage-prefix`) como
**último** parâmetro de `store` — não o primeiro, ao contrário da convenção
D2 acima — porque o wrapper `objectStorage` usa-o para prefixar o caminho do
upload (ver "Decisões de design").

### Entrada (use cases)

- `CreateInvoiceUseCase` — criação manual com linhas opcionais; cria payable entry se dueDate presente.
- `UpdateInvoiceUseCase` — actualiza campos do cabeçalho (inclui novos campos de classificação financeira, incluindo `stockReviewOverride`/`stockReviewOverrideReason`). Quando `invoiceNumber` muda: (1) valida duplicado por NIF (se disponível) ou por `supplierId`; (2) propaga o novo número ao payable entry (`renumberByInvoiceId`) e aos links de conciliação bancária (`renumberLinksForInvoice`). Quando `stockReviewOverride` muda, corre primeiro o guard partilhado contra revisão de stock órfã (ver "Decisões de design").
- `MarkInvoicePaidUseCase` — transita para `paid` + `reconciliationStatus=pending_reconciliation`; aceita `bankAccountId`, `paymentMethod` e `paymentNotes` opcionais; sincroniza payable entry.
- `MarkInvoiceReconciledUseCase` — transita `reconciliationStatus` de `pending_reconciliation` para `reconciled`. Requer fatura já paga.
- `SetInvoiceStatusUseCase` — força estado arbitrário; cancela payable entry se `cancelled`.
- `SetLineDetailModeUseCase` — alterna entre `simple` e `detailed`. Na transição `detailed → simple`, apaga todas as linhas da fatura (`deleteByInvoiceId`) — em modo simples a linha automática é derivada dos totais do cabeçalho, e linhas armazenadas ficariam ambíguas para analytics. A transição nunca é bloqueada por divergência de totais. Antes de apagar, corre o guard partilhado contra revisão de stock órfã (ver "Decisões de design") — só quando há mesmo linhas a apagar.
- `AddInvoiceLineUseCase` — adiciona linha a fatura existente (requer `lineDetailMode=detailed`). Valida que a soma das linhas não excede `totalWithVat` da fatura (tolerância: 1 cêntimo). Aceita `locationId` opcional (D4) — ver "Alocação de linha a uma loja" abaixo.
- `UpdateInvoiceLineUseCase` — actualiza valores de uma linha existente (descrição, quantidade, unidade, preço unitário, IVA, total, `locationId`). Requer `lineDetailMode=detailed`. Valida que a soma das linhas não excede `totalWithVat` da fatura (tolerância: 1 cêntimo).
- `DeleteInvoiceLineUseCase` — elimina uma linha de uma fatura em modo `detailed`. Requer `lineDetailMode=detailed`; lança `LineDetailModeError` caso contrário.
- `ClassifyInvoiceLineUseCase` — classifica linha; quando `costCenterCategoryId` presente, herda automaticamente os campos da subcategoria via `CostCenterCategoryReaderPort`. Opcionalmente grava/actualiza `ClassificationRule` com `descriptionPattern` e `channelId`.
- `SuggestLineClassificationUseCase` — sugestão de classificação por `supplierId` + `description?`; retorna `channelId` quando presente na regra.
- `ListInvoicesUseCase` — filtra por fornecedor, CC, estado, intervalo de datas, `isDirectDebit`. Injeta `CostCenterCategoryReaderPort`; recolhe os `costCenterCategoryId` únicos de todas as faturas devolvidas, chama `findManyByIds` uma única vez e constrói o `categoryMap` passado a `toInvoiceDTO` — garante que `classificationSummary` tem `code` e `name` corretos mesmo na listagem. Faturas «Por artigo» (`detailed`): carrega as linhas de todas de uma vez (`findByInvoiceIds`, em lotes de 200 ids e páginas de 1000) e a classificação vem das linhas, como no detalhe — única / mista / pendente. Antes ia sem linhas e caía na categoria do cabeçalho, vazia nestas faturas → «Classificação pendente» com as linhas classificadas (FT 61707, 2026-10-25).
- **`ProcessDirectDebitsUseCase`** — busca faturas de DD com `directDebitDate ≤ hoje` e status não pago/cancelado; marca-as como pagas na `directDebitDate` e sincroniza payable entries.
- `ListInvoiceLinesUseCase` — todas as linhas (para analytics por CC).
- `GetInvoiceUseCase` — detalhe com linhas. Inclui sempre `classificationSummary` (ver abaixo). Quando `lineDetailMode=detailed`, o DTO inclui também `linesSummary = { subtotalWithoutVat, totalVat, totalWithVat, totalsMismatch }` com tolerância de 1 cêntimo.
- `DeleteInvoiceUseCase` — remove fatura, linhas e ficheiro em storage (se tiver `attachmentUrl`). Antes de apagar as linhas, corre o guard partilhado contra revisão de stock órfã (ver "Decisões de design") — mesmo risco de violação da FK `stock_review_lines_invoice_line_id_fkey` já tratado em `UpdateInvoiceUseCase`/`SetLineDetailModeUseCase`. Depois: cancela o payable entry associado (`cancelByInvoiceId`) e remove os links de conciliação bancária (`removeLinksForInvoice`), actualizando os movimentos bancários afectados.
- **`ImportInvoiceUseCase`** — armazena ficheiro, extrai dados via IA, procura fornecedor por NIF, aplica defaults, cria `Invoice` em `draft_ai`.
- **`ConfirmImportedInvoiceUseCase`** — aplica correções do utilizador, transita `draft_ai`/`pending_review` → `pending`; salva linhas opcionais (com `locationId` opcional por linha); cria payable entry se pedido. Suporta `newSupplier` (cria fornecedor via `SupplierCreatePort` antes de guardar) e propaga `costCenterCategoryId` para todas as linhas. Quando linhas são fornecidas, define automaticamente `lineDetailMode=detailed`.
- **`GetInvoiceAlertsUseCase`** — devolve contagens e valores para os 8 tipos de alerta.

### Saída (dependências do domínio)

- `InvoiceRepositoryPort` — `save(organizationId, invoice)`, `findById(organizationId, id)`, `findAll(organizationId, filter?)`, `update(organizationId, invoice)`, `delete(organizationId, id)`, `findDuplicate(organizationId, invoiceNumber, supplierId, excludeId?)`, `findDuplicateByNif(organizationId, invoiceNumber, supplierNif, excludeId?)`, `findPendingDirectDebits(organizationId)`.
- `InvoiceLineRepositoryPort` — `saveAll(organizationId, lines)`, `findAll(organizationId)`, `findByInvoiceId(organizationId, invoiceId)`, `updateLine(organizationId, line)`, `deleteByInvoiceId(organizationId, invoiceId)`, `deleteLineById(organizationId, lineId)`, `updateCostCenterCategoryForInvoice(organizationId, invoiceId, categoryId)` (bulk update do CC de todas as linhas).
- `ClassificationRuleRepositoryPort` — `findBySupplierId(organizationId, supplierId)`, `findBySupplierIdAndDescription(organizationId, supplierId, description?)`, `save(organizationId, rule)`, `update(organizationId, rule)`.
- `CostCenterCategoryReaderPort` — `findById(organizationId, id)` (snapshot mínimo da subcategoria para herança; sem acoplamento ao módulo `financial-base`); `findManyByIds(organizationId, ids)` (lookup batch para `classificationSummary` em `GetInvoice` e `ListInvoices`).
- `PayableEntryWritePort` — `createForInvoice(organizationId, data)`, `markPaidByInvoiceId(organizationId, invoiceId, paidAt)`, `cancelByInvoiceId(organizationId, invoiceId)`, `renumberByInvoiceId(organizationId, invoiceId, newInvoiceNumber)` (actualiza a `description` das entradas não canceladas quando o número da fatura muda).
- `InvoiceReconciliationCleanupPort` — interface declarada no módulo `invoices` para evitar acoplamento ao módulo `bank-statements`. Dois métodos: `removeLinksForInvoice(organizationId, invoiceId)` (remove links do tipo `invoice` e recalcula estado de conciliação dos movimentos afectados) e `renumberLinksForInvoice(organizationId, invoiceId, newLabel)` (actualiza `entity_label` dos links quando o número da fatura muda).
- **`AiExtractionPort`** — `extract(fileUrl, mimeType): Promise<AiExtractionResult>`. Sem organização — nunca toca a base de dados.
- **`CategoryCatalogReadPort` / `ConfirmedLineHistoryPort` / `LineCategoryAiPort`** *(leitor inteligente E2, `line-classification.ports.ts`)* — catálogo de Categorias da organização, linhas de faturas confirmadas do fornecedor e IA só para as linhas por resolver (devolve ids do catálogo, validados). Usadas por `ClassifyInvoiceLinesUseCase`; **adapters e ligação ao import ficam para a E3**.
- **`PdfContentReaderPort`** *(leitor inteligente E1)* — `read(buffer, mimeType): Promise<PdfContent | null>`: texto nativo do PDF com posições + QR codes descodificados localmente. null = não é PDF legível. Sem organização, sem rede. Ainda **não ligado** ao `ImportInvoiceUseCase` (fica para a E3, com migração).
- **`DocumentStoragePort`** — `store(buffer, filename, mimeType, organizationId): Promise<string>`. Desde ADR-0015 (ticket 03), o wrapper `objectStorage` (`src/infra/scoped-db/object-storage.ts`) usa `organizationId` para prefixar o caminho de novos uploads a `invoice-documents` (bucket opt-in) — `{org_id}/{timestamp}_{safeName}`. Objectos já existentes ficam nos caminhos sem prefixo e continuam a resolver sem alterações (sem backfill, ADR-0015 DB2). `delete(url)` continua sem organização.
- **`SupplierLookupPort`** — `findByNif(organizationId, nif)` + `findByName(organizationId, query)` + `findAll(organizationId)`. Inclui defaults do fornecedor.
- **`SupplierCreatePort`** — `create(organizationId, data)` para criar fornecedor durante confirmação de importação.
- **`SupplierHintPort`** — `findByNormalizedName(organizationId, normalizedName)` + `save(organizationId, normalizedName, supplierId)`.
- **`OrganizationIdentityReadPort`** *(cross-module)* — `getNif(organizationId)`. Usado só por `ImportInvoiceUseCase` para nunca aceitar o NIF da própria organização como fornecedor de uma fatura importada (ver "Decisões de design").
- **`RecurrenceLinkPort`** *(cross-module, payable-recurrences)* — `autoLinkInvoice(org, invoiceId)` depois de criar/confirmar; `releaseInvoice(org, invoiceId, paymentGroupId)` depois de apagar. Implementado por `PayableRecurrencesLinkAdapter` (delega nos input ports do outro módulo, ligados em `src/server.ts`). Usado por decoradores (`application/use-cases/recurrence-link.decorators.ts`) à volta de criar, confirmar e apagar — uma falha nunca falha o caso de uso.
- `InvoiceRepositoryPort` ganhou `setPaymentGroup(org, ids, groupId)` e `findByPaymentGroup(org, groupId)` (documento de pagamento).
- **`OccurrenceSyncPort`** — `markPaidByInvoiceId(organizationId, invoiceId, paidAt)`.
- **`InvoiceStockReviewStatusReadPort`** *(D10)* — `findForInvoice(organizationId, invoiceId)`: existe uma revisão de stock (módulo `stock-purchase-review`) para esta fatura, e em que estado. Usado só pelo guard de edição (ver "Decisões de design").
- **`InvoiceStockReviewDraftDeletePort`** *(D10)* — `deleteDraft(organizationId, invoiceId, actor)`: pede ao módulo `stock-purchase-review` para apagar (hard delete) uma revisão ainda não aplicada, quando o utilizador confirma explicitamente. Nunca chamado sem confirmação explícita (ver guard).
- **`FiscalIdentityPort`** *(F1 v1.2, cross-module)* — `check`/`claim`/`release` da identidade fiscal partilhada Financeiro/Stock; implementado por `FiscalDocumentsIdentityAdapter` sobre o módulo `fiscal-documents` (ADR-0039).
- **`InvoiceAmountsWritePort`** *(F1 v1.2 §1.3)* — `save(organizationId, invoiceId, record)`: grava bruto, descontos (linha/global/rodapé), ajustes, ajuste de arredondamento com motivo, quadro de IVA por taxa, diferença para a fatura e `amounts_validated_at`, e por linha os textos originais (quantidade/preço) e bruto/desconto/líquido. Separado do repositório da fatura para não mexer no mapeamento legado.
- **`InvoiceAuditPort`** *(F1 §1.4)* — `record(organizationId, entry)`: autor, origem (`manual`/`import`/`system`), ação, antes/depois (`auditSnapshot`) e motivo. Só se acrescenta.
- `InvoiceRepositoryPort.claimVersion(organizationId, id, expectedVersion | null)` *(F1 §1.4)* — incremento atómico e condicional da versão (null = outra escrita passou à frente).
- `PayableEntryWritePort` ganhou (F1) `activeStatusOf`, `syncOpenForInvoice` e `listDuplicateActive` — uma obrigação ativa por fatura.

## Adapters

### Entrada

- `createInvoiceRouter` → expõe use cases via REST em `/api/invoices`.

### Saída

Nenhum adapter guarda um `SupabaseClient`: todos (excepto os dois abaixo que
não tocam a base de dados) recebem o factory `createScopedQuery`
(`ScopedQueryFactory`, `src/infra/scoped-db/scoped-query.ts`) injectado pelo
composition root e constroem um `ScopedQuery` escopado por chamada (D2). O
módulo não importa `@supabase/supabase-js` em lado nenhum — só o folder
`src/infra/scoped-db/` está autorizado a fazê-lo (D10).

- `SupabaseInvoiceRepository` → tabela `invoices` (actualizado com novos campos).
- `SupabaseInvoiceLineRepository` → tabela `invoice_lines`; inclui `updateCostCenterCategoryForInvoice`, `deleteLineById` e o mapeamento de `location_id` (nullable).
- `SupabaseInvoiceReconciliationCleanupAdapter` → acede directamente às tabelas `bank_movement_entity_links` e `bank_movements` sem importar código do módulo `bank-statements`. Implementa `removeLinksForInvoice` (apaga links + recalcula status dos movimentos) e `renumberLinksForInvoice` (actualiza `entity_label`).
- **`FinancialBaseSupplierCreateAdapter`** → delega criação de fornecedor ao financial-base, passando adiante o `organizationId` recebido (já não usa o `UNATTENDED_SCOPE`, que era o stopgap antes desta conversão).
- **`StockPurchaseReviewStatusReadAdapter`/`StockPurchaseReviewDraftDeleteAdapter`** *(D10)* → delegam diretamente para os input ports `GetStockPurchaseReviewStatusPort`/`DeleteDraftStockPurchaseReviewPort` do módulo `stock-purchase-review`, sem tradução (mesmo padrão de `StockPurchaseReviewDecisionAdapter`).
- `SupabaseClassificationRuleRepository` → tabela `classification_rules`.
- `SupabasePayableEntryWriteAdapter` → tabela `payable_entries`.
- **`SupabaseDocumentStorageAdapter`** → bucket Supabase Storage `invoice-documents`. Não recebe `SupabaseClient` no construtor: delega para o wrapper `objectStorage` de `src/infra/scoped-db/` (spec B2 ticket 01/D10; organização em ADR-0015, ticket 03) — esse folder é o único lugar em `src/**` autorizado a importar `@supabase/supabase-js`. `store()` recebe `organizationId` do use case e devolve o path efectivo (prefixado, ver Ports acima) que `getPublicUrl` usa para montar o URL.
- **`SupabaseSupplierLookupAdapter`** → tabela `suppliers` (NIF + defaults).
- **`SupabaseSupplierHintAdapter`** → tabelas `supplier_import_hints` + `suppliers`.
- **`SupabaseOrganizationIdentityReadAdapter`** → cross-module; lê só a coluna `nif` da tabela `organizations` directamente, sem importar código do módulo `financial-base`.
- **`PayableRecurrencesLinkAdapter`** → delega em `AutoLinkInvoicePort`/`ReleaseInvoiceLinksPort` do módulo `payable-recurrences`.
- **`SupabaseOccurrenceSyncAdapter`** → tabela `recurring_occurrences`, sem importar código do módulo `payable-recurrences`.
- **`OpenAiExtractionAdapter`** → GPT-4o Vision, devolve JSON estruturado. Sem organização — não toca a base de dados. Desde F1 pede também os textos originais de quantidade/preço, descontos por linha, desconto global/rodapé e o quadro de IVA por taxa (taxa ausente = null, nunca 0).
- **`SupabaseInvoiceReadingWriteAdapter`** → `invoices.fiscal_qr` / `reading_source` (migração `20261106100000`).
- **`SupabaseCategoryCatalogAdapter` / `SupabaseConfirmedLineHistoryAdapter`** → catálogo `cost_center_groups`/`cost_center_categories` e linhas de faturas confirmadas do fornecedor (`invoice_lines.supplier_item_code`, descrição, subcategoria). Só leitura.
- **`OpenAiLineCategoryAdapter`** → `OPENAI_MODEL_TEXT` (por omissão `gpt-4o-mini`), resposta com esquema JSON estrito cujo enum são os ids do catálogo; só descrições das linhas por resolver.
- **`SupabaseObligationCandidatesAdapter`** → lê `invoices` e `payable_entries` (mesmo valor ou número com o mesmo prefixo) para a procura de obrigações já registadas. Só leitura.
- **`PdfjsContentReaderAdapter`** → `pdfjs-dist` (vem com o `pdf-parse`; versão fixada em `overrides`) para o texto com posições e `jsqr` para os QR: primeiro nas imagens incorporadas, só sem QR fiscal assim rasteriza a 1.ª página (`pdf-to-img`). Nada sai do servidor. Sem QR fiscal nas imagens, rasteriza até 4 páginas e procura por janelas sobrepostas (½ × ⅓ da página) a 2× e depois 4× — QR em vetor, noutra página que não a 1.ª, ou vários na mesma página (documentos de pagamento das águas). Imagens partilhadas entre páginas («g_…») são lidas de `commonObjs` e cada imagem só uma vez — procurá-las em `objs` esperava 1,5 s por cada (documento das águas: 22 s → 2,4 s). A leitura local tem 20 s (`LOCAL_READ_TIMEOUT_MS`; o Render starter é lento); excedida, segue pela IA com o aviso `local_read_timeout` na revisão e um `console.warn` no log; falhas da rasterização também vão para o log. Máx. 30 páginas; espera por cada imagem limitada a 1,5 s (havia PDFs em que o pdfjs nunca a devolvia e a leitura ficava pendurada). `readBarcode` rasteriza só quando pedido (2×, 3×; 4× se ilegível).
- **`FiscalDocumentsIdentityAdapter`** → delega no input port do módulo `fiscal-documents`.
- **`SupabaseInvoiceAuditAdapter`** → tabela `invoice_audit_logs` (migração `20261030160000_invoice_version_audit`; RLS só select/insert).
- **`SupabaseIdempotencyStore`** (infra partilhada, ADR-0022) → `Idempotency-Key` opcional em `POST /invoices`, `POST /invoices/import` e `POST /invoices/:id/confirm`.
- **`SupabaseInvoiceAmountsWriteAdapter`** → colunas de valores de `invoices`/`invoice_lines` (migração `20261030150000_invoice_amounts_discounts`).

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
| PATCH | `/api/invoices/:id` | Actualizar cabeçalho — body aceita `confirmRemoveStockReview?: boolean` (ver "Decisões de design") |
| PATCH | `/api/invoices/:id/paid` | Marcar como paga — body: `{ paidAt?, bankAccountId?, paymentMethod?, paymentNotes? }` |
| PATCH | `/api/invoices/:id/reconcile` | **Novo** — marcar como conciliada (requer `status=paid`) |
| PATCH | `/api/invoices/:id/line-detail-mode` | **Novo** — alternar modo de linhas — body: `{ mode: "simple"\|"detailed", confirmRemoveStockReview?: boolean }` |
| PATCH | `/api/invoices/:id/status` | Forçar estado |
| DELETE | `/api/invoices/:id` | Eliminar fatura e linhas |
| POST | `/api/invoices/:invoiceId/lines` | Adicionar linha a fatura existente |
| PATCH | `/api/invoices/:invoiceId/lines/:lineId` | Editar valores de uma linha (requer `lineDetailMode=detailed`) |
| DELETE | `/api/invoices/:invoiceId/lines/:lineId` | Eliminar linha (requer `lineDetailMode=detailed`) |
| PATCH | `/api/invoices/:invoiceId/lines/:lineId/classify` | Classificar linha |
| PATCH | `/api/invoices/:invoiceId/lines/:lineId/deductibility` | **Novo (módulo Contabilidade)** — override de dedutibilidade de IVA — body: `{ deductiblePercentage: number\|null, deductibilityOverrideReason: string\|null }` |
| POST | `/api/invoices/process-direct-debits` | Processar débitos diretos vencidos (manager+) |
| POST | `/api/internal/cron/process-direct-debits` | Idem, via cron, para todas as organizações (Bearer `CRON_SECRET`) |

## Decisões de design

- **Logótipo do fornecedor a partir da fatura (E3b-1)** — no import, se o fornecedor reconhecido ainda não tem logótipo (ou não foi reconhecido), `PdfContentReaderPort.extractLogo` escolhe a imagem incorporada com cara de logótipo na 1.ª página (posição real pela matriz do PDF: topo da página, tamanho razoável, não QR/código 2D, não fundo de página, preferência pelo lado esquerdo), guarda-a em PNG reduzido no armazenamento da organização e devolve `logoSuggestion`. **Nunca grava no fornecedor sozinho**: a revisão mostra «Usar como logótipo do fornecedor» e só depois de confirmar a fatura é feito `PATCH /financial-base/suppliers/:id { logoUrl }` (o servidor só aceita URLs do nosso armazenamento). Logótipos «colados» em imagens de página inteira não são propostos. Coluna `suppliers.logo_url` (migração `20261108100000`).
  - **Mudança de decisão (2026-10-25, pedido do utilizador): o logótipo passa a ser gravado sozinho** — só em fornecedores **sem** logótipo, nunca por cima de um existente (que se troca ou remove na ficha). `FillSupplierLogosUseCase` (porta de entrada `FillSupplierLogosPort`, `domain/ports/in/supplier-logo.ports.ts`): lê até 3 PDFs das faturas mais recentes do fornecedor (`SupplierInvoiceAttachmentsPort`; digitalizadas não dão logótipo), aplica o mesmo `extractLogo`, guarda o PNG e grava via `UpdateSupplierPort` do financial-base (`FinancialBaseSupplierLogoAdapter`, D10). Dois gatilhos: (1) `ConfirmImportedInvoiceUseCase`, em segundo plano depois de confirmar (a própria fatura primeiro; falhas só vão para o log); (2) `POST /invoices/supplier-logos/fill` { after? } — um lote de 10 fornecedores sem logótipo por pedido, com cursor `next`; o ecrã Fornecedores («Procurar logótipos nas faturas», permissão `finance.suppliers` MANAGE) repete até `null`. O `logoSuggestion` do import continua só como pré-visualização («fica no fornecedor ao confirmar»); a revisão deixou de fazer o `PATCH`.

- **Leitor genérico para qualquer fatura com QR (E3b)** — `GenericQrLayout` (estrito, a seguir aos layouts específicos): tabela encontrada pelo cabeçalho (Descrição + colunas de valores; cabeçalhos em duas linhas juntos só se todas as palavras estiverem sobre/sob um título), descrição em várias linhas, cópias ORIGINAL/DUPLICADO não somadas, subtotais/transportes saltados, linha negativa = desconto da mesma taxa. A coluna do valor líquido de cada linha é a que **soma exatamente as bases do QR por taxa**; a taxa de cada grupo só é aceite se base × taxa = IVA do QR (`qr-rates.ts`). Quantidade e preço só ficam quando batem com o líquido; sem preço impresso, o preço fica por derivar na revisão (nunca total × quantidade). Vencimento lido do PDF. Só é aceite se reconciliar ao cêntimo; senão IA, mas com identidade e totais do QR (`applyQrToExtraction`). Aceites com aviso: IVA arredondado linha a linha pelo emitente (exatamente a soma por linha → ajuste de arredondamento proposto) e QR com o campo L repetido igual ao total. Linhas da IA passam por `sanitizeExtractedLines` (quantidade × preço ≠ total impresso → prevalece o total). Faturas sem QR → 100% IA. Também: notas de crédito com linhas a negativo (valores em absoluto), preços com IVA incluído (bases repartidas a partir da base do QR, aviso), grupo tributado com IVA 0 € no QR (taxa 0%, aviso de autoliquidação/isenção), milhares com espaço («1 405,73»), quadros «Especificação do Imposto/Cód. Isenção» como fim da tabela.
- **Só documentos fiscais de compra** — o tipo do QR (campo D) tem de ser FT, FS, FR, NC ou ND (`ACCEPTED_FISCAL_DOCUMENT_TYPES`); pró-formas, orçamentos, guias e recibos são recusados com `NotAFiscalInvoiceError` (422 `not_fiscal_invoice`) antes de o ficheiro ser guardado. Sem QR não há tipo fiscal para verificar (segue a IA).

- **Leitor inteligente ligado ao import (E3)** — `ImportInvoiceUseCase` recebe `SmartReadingDeps` (opcional): lê o PDF localmente (`PdfContentReaderPort`, máx. 8 s) e, se um layout reconhecer o documento (`readInvoice`), converte a leitura no mesmo formato da IA (`readingToExtraction`) e **não chama a IA**; sem layout, sem texto ou falha → IA como antes. O ATCUD do QR vai para a identidade fiscal; os campos do QR e a origem (`deterministic`) ficam em `invoices.fiscal_qr`/`reading_source` (`InvoiceReadingWritePort`). Cada linha extraída leva `meta` (código do artigo, página, ordem, tipo, código de IVA, promoção, depósito→artigo, notas IEC) e a subcategoria sugerida por `ClassifyInvoiceLinesPort` (histórico confirmado → palavras-chave → IA só no resto; `INVOICE_LINE_AI=off` desliga a IA; uma falha nunca faz falhar o import). Ao confirmar/guardar rascunho, as linhas com `reading` gravam `invoice_lines.supplier_item_code` e `reading_meta` (migração `20261106100000`); linhas manuais não tocam nessas colunas. O histórico para sugerir vem de faturas confirmadas do mesmo fornecedor (`SupabaseConfirmedLineHistoryAdapter`, estados pending/paid/overdue/review). A resposta traz `reading` (origem, layout, QR lido, estado, problemas, chamadas à IA, ms).

- **Importação em lote / em segundo plano (E4)** — `POST /invoices/import` com `keepDraftLines=true` → `ImportInvoiceKeepingLinesUseCase`: a mesma importação, mas as linhas lidas e os valores do documento ficam gravados no rascunho (`persistExtractedDraft`, `shared-extracted-draft.ts`, também usado pela F3c) e a resposta traz a versão atual do rascunho. Gravar é uma ajuda: se falhar, fica como a importação normal. A fila (até 10 ficheiros, 2 de cada vez) vive no frontend.
- **Orçamento diário de IA por organização** — `AiBudgetPort` → `SupabaseAiBudgetAdapter` (`ai_usage_daily`, dia UTC, total de todas as funcionalidades; limite `AI_DAILY_LIMIT_PER_ORG`, omissão 300; migração `20261112160000`). Leitura pela IA de uma fatura sem leitura determinística pede autorização antes de guardar o ficheiro → esgotado: 429 `ai_budget_exceeded` (faturas com QR continuam a ser lidas sem IA). Categorias por linha (`ClassifyInvoiceLinesUseCase`) e conciliação de artigos do Stock ficam só com regras/histórico quando esgotado. Contagem ler-somar-gravar (pode passar o limite por uma ou duas chamadas em simultâneo).
- **Ligar documento de cobrança a um registo existente** — `POST /invoices/:id/link-obligation` (multipart `file`) → `LinkObligationUseCase`: volta a ler o documento; só aceita um registo que a procura de obrigações aponte para ele (senão 422 `obligation_link_mismatch`); o registo passa a obrigação (tipo, referência, entidade, período) e fica com o PDF se não tinha anexo. Valores, número, estado e conta a pagar não mudam.
- **Importar a fatura diretamente no Stock (task v1.2 F3c)** — `POST /invoices/import-for-stock` (multipart `file`, `routeExisting`; permissão `stock.purchase_reviews` MANAGE, classificada antes da regra geral de faturas) → `ImportInvoiceForStockUseCase`: usa o mesmo `ImportInvoiceUseCase` (QR fiscal + texto, IA só sem leitura, mesmo ficheiro / identidade fiscal = mesmo documento). Já deu entrada no Stock (revisão `applied`/`excluded`, ou identidade antiga `existing_stock_only`) → **409 `already_in_stock` (bloqueia)**; já em Compras por rever → 409 `already_in_review` { reviewId }; rascunho no Financeiro → 409 `draft_in_finance`; lançada sem Stock → 409 `exists_not_routed` (com `routeExisting=true` cria a revisão, sem pendência). Novo: grava as linhas lidas no rascunho (`SaveInvoiceDraftUseCase`, modo «Por artigo», descontos e quadro de IVA lidos), marca `importOrigin = "stock"` + «Enviar para Stock» forçado (coluna `invoices.import_origin`, migração `20261112150000`), reserva a identidade fiscal (o Financeiro, ao importar o mesmo PDF, abre este rascunho) e cria a revisão com `origin: "stock"`. Sem linhas lidas → 422 `extraction_failed` e o rascunho/ficheiro são apagados (sem processamento infinito). Nunca cria conta a pagar.
- **Linhas protegidas por Compras por rever (F3c)** — `keepLinesUnderStockReview` (`shared-stock-locked-lines.ts`) em «Confirmar» e «Guardar rascunho»: se a fatura já tem revisão de Stock e o pedido traz as mesmas linhas (descrição, quantidade e preço, pela ordem), mantêm-se as guardadas (os ids que a revisão referencia) e só se aplica a classificação, com os valores do pedido a recalcular o motor; se as mudou → revisão movimentada bloqueia (`InvoiceLinesLockedByAppliedStockReviewError`), senão 409 `requiresConfirmation` e, com `confirmRemoveStockReview`, a revisão por aplicar é descartada antes de substituir.
- **Apagar / acrescentar uma linha numa fatura em Compras por rever (2026-10-25, FT 61707)** — `DELETE /invoices/:id/lines/:lineId` (`?confirmRemoveStockReview=true`) e `POST /invoices/:id/lines` (`confirmRemoveStockReview` no corpo) passam pelo mesmo `guardAgainstBlockingStockReview`: revisão movimentada → 409 com mensagem para a pessoa (a classificação continua editável em «Linhas»); por aplicar → 409 `requiresConfirmation`, e com confirmação a revisão é descartada. Antes, «Editar fatura completa» apagava as linhas uma a uma e rebentava na FK `stock_review_lines_invoice_line_id_fkey`. As mensagens destes dois erros já não levam o id interno — são mostradas tal e qual na UI.
- **Rascunho de obrigação AT/SS (E3b-2)** — `POST /invoices/obligations` (multipart `file`, `force`) → `CreateObligationDraftUseCase`: o servidor **volta a ler o ficheiro** (nunca confia em valores do ecrã) e cria um rascunho na tabela `invoices` com `document_kind` = `tax_obligation` (Finanças) ou `contribution_obligation` (SS), `payment_reference`, `mb_entity` e `obligation_period` (migração `20261109100000`; faturas existentes = `purchase`). Sem IVA (total = base), sem linhas, `stockReviewOverride = force_skip`; prazo do documento; fornecedor/Categoria do fornecedor habitual do organismo; número = nº do documento AT ou «SS AAAA-MM referência». Recusa: não é documento de cobrança ou tem problema bloqueante → 422 `not_payment_document`; obrigação claramente já registada (correspondência forte) → 409 `obligation_exists { existing }` sem guardar ficheiro, salvo `force=true`. A conta a pagar só nasce ao confirmar o rascunho; confirmar/editar uma obrigação **não reclama identidade fiscal** de faturas (não é documento ATCUD) nem decide Stock. `InvoiceDTO.obligation` (ausente/null = fatura de compra).
- **Documentos de cobrança AT/SS (task V4 do leitor)** — `POST /invoices/import` chama primeiro `ReadPaymentDocumentUseCase` (porta `ReadPaymentDocumentPort`, opcional no controller): lê o PDF localmente, deteta «Declaração de retenções na fonte» (AT) ou «Referência para pagamento» da Segurança Social pelos marcadores do texto (`payment-documents.ts`) e, nesse caso, responde **200** `{ kind: "payment_document", payment, matches, supplierSuggestion, metrics }` **sem gravar nada** (sem fatura, conta a pagar, ficheiro, IVA nem Stock; 0 chamadas à IA). Qualquer outro documento — ou falha/demora > 8 s da leitura local — segue o `ImportInvoiceUseCase` **sem alterações**; `treatAsInvoice=true` continua a forçar o fluxo de faturas (já não usado pelo frontend). Campos vêm dos rótulos do texto, nunca de posições do código de barras; CODE128 lido localmente (`adapters/out/barcode/code128.ts`, sem dependências: zona branca, controlo e ≥ 2 linhas iguais; «visível mas ilegível» só com o mesmo padrão em ≥ 10 linhas) e conferido com o valor impresso. A SS não é rasterizada (não tem código); NISS e código de acesso nunca são lidos. Duplicados: `matchObligations` cruza faturas e contas a pagar da mesma organização por referência, nº do documento, número parecido (dígitos trocados — caso real: a IA antiga gravou 80692339323 em vez de 80692393323) e valor + prazo/período; só sugere.

- **Classificação por linha (E2 do leitor inteligente)** — `domain/services/classification/`: cada linha real recebe uma subcategoria do catálogo **da organização**, nunca só o habitual do fornecedor. Ordem: depósito pelo tipo da linha → histórico confirmado do mesmo fornecedor (referência do artigo, depois descrição normalizada; só se unânime) → palavras-chave conservadoras (`keyword-rules.ts`, códigos do catálogo predefinido; a primeira regra ganha, específicas primeiro) → IA só no que sobra (`ClassifyInvoiceLinesUseCase`, uma chamada por fatura, máx. 120 linhas, ids validados contra o catálogo ativo) → por resolver. Histórico em conflito **suspende** tudo (nem palavras-chave nem IA). Cada sugestão traz `source` e `evidence`; sem percentagens de confiança. É sempre sugestão — confirmar continua humano. Medição offline (sem histórico, sem IA) em 41 faturas Makro: 601/661 linhas com sugestão; as regras foram afinadas com estas faturas, por isso o número é otimista.

- **Leitor determinístico de faturas (E1 do leitor inteligente, `.scratch/leitor-faturas/spec.md`)** — `domain/services/reading/`: o **QR fiscal AT** dá identidade e totais (`fiscal-qr.ts`, pares divididos pelo primeiro `:`, coerência N/O verificada); um **layout por fornecedor** lê as linhas reais do texto nativo (`makro-layout.ts`: colunas da esquerda e IVA pela posição do cabeçalho, colunas finais pelo significado porque o MOT nem sempre fica alinhado; páginas de continuação sem cabeçalho; depósitos «0 D» ligados ao artigo anterior; IEC como anotação nunca somada; «Leve Mais Pague Menos» aplicado uma vez à linha com o mesmo MOT, «Desconto Total» só resumo); `invoice-reader.service.ts` reconcilia com o **motor único** (`src/kernel/money`, IVA calculado **por taxa**, por isso 4,14 € ≠ 4,16 € linha a linha é aceite) e cruza nº de artigos, depósitos, total s/ IVA, valores transportados e QR × cabeçalho × quadro de IVA. A taxa de cada linha vem do **quadro de IVA do próprio documento** (código → taxa), nunca da categoria. Nada é corrigido: o que não fecha é um `ReadingIssue` bloqueante (`needs_attention`); sem layout → `unsupported` (o chamador usa a IA). Prova: 3 faturas Makro de referência 100% iguais ao fixture (59 linhas, 142 un., 1.087,37 €) e 41 faturas Makro reais prontas ao cêntimo — fixtures reais ficam **fora do repositório**; os testes do repositório usam uma fatura sintética (`__tests__/domain/reading/synthetic-makro.ts`).

- **Override de dedutibilidade de IVA por linha (módulo Contabilidade)**: `InvoiceLine.applyDeductibilityOverride(percentage, reason)` — `percentage: null` volta a usar a sugestão de `cost_center_categories.vat_deductible` (100% ou 0%); um valor explícito exige sempre `deductibilityOverrideReason` (mesma regra espelhada em `accounting`'s `AccountingDocument`) — a subcategoria nunca decide sozinha quando o gestor diverge. Lido por `accounting`'s `GetVatOverviewUseCase` via `ListInvoiceLinesPort` já existente (só mais 2 campos no DTO, sem mudança de assinatura de porta).
- **Gancho fire-and-forget para `stock-purchase-review` (módulo Stock)**: `CreateInvoiceUseCase`/`ConfirmImportedInvoiceUseCase` chamam `StockDecisionNotifyPort.notifyInvoiceFinalized(...)` logo após gravar a fatura+linhas, dentro de um `try/catch` que nunca propaga — uma falha aqui nunca bloqueia o lançamento da fatura (a varredura de recuperação desse módulo reprocessa mais tarde). Campo novo `stockReviewOverride` (`auto|force_create|force_skip`, default `auto`) + `stockReviewOverrideReason` na fatura — só um sinal de entrada para a decisão desse módulo, `invoices` nunca interpreta o valor. `getInvoice`/`listInvoices` também passaram a ser expostos pelo módulo (D10) para esse módulo revalidar a fatura antes de confirmar uma revisão.
- **Upload multipart no controller, não no use case**: o controller faz a leitura do buffer (`multer`) e passa-o ao `ImportInvoiceUseCase`. O domínio nunca toca em `Buffer` — só vê `DocumentStoragePort` e `AiExtractionPort` como interfaces.
- **AI extraction via base64, não URL público**: o `OpenAiExtractionAdapter` armazena primeiro o ficheiro no Supabase Storage, lê o buffer e envia-o como `data:<mimeType>;base64,...` diretamente à API GPT-4o Vision. Nenhum URL público é partilhado com a OpenAI.
- **`storage.objects` RLS no bucket `invoice-documents` (ticket 05, ADR-0015) — protege operações administrativas, não leitura por URL**: `supabase/migrations/20260909140000_invoice_documents_storage_rls.sql` adiciona políticas `select`/`insert`/`update`/`delete` chave­adas em `(storage.foldername(name))[1] = current_org()::text` (reutiliza `current_org()`, criada pela migration do ticket 04 para `hr-documents`). **Limitação explícita, confirmada no smoke do ticket 05 (`.scratch/kiosk-pin-storage-prefix/issues/05-smoke-verification.md`): o bucket continua público, e servir um objecto (via URL pública directa OU via `.download()` autenticado) não passa pelas políticas RLS de todo — nenhuma delas protege quem já tem/guarda um URL de uma fatura.** As políticas só têm efeito real sobre listagem e escrita/eliminação por path (impedir a organização A de listar, sobrescrever ou apagar um objecto da organização B adivinhando ou enumerando o caminho). A política de `select` foi acrescentada apesar do ticket pedir apenas "write/delete": sem ela, `delete`/`update` não funcionam mesmo para o próprio dono — é um mecanismo geral do RLS do Postgres (UPDATE/DELETE precisam de visibilidade SELECT sobre a linha alvo antes da sua própria cláusula USING ser avaliada), confirmado empiricamente antes de expedir a migration (ver Deviation 1 do smoke). Não converte o bucket para leitura privada/URLs assinados (DB3, fora de âmbito) — essa é uma decisão de produto, não desta spec.
- **Linhas de fatura opcionais no import**: o MVP regista sempre os totais da fatura. As linhas são salvas durante `confirmImport` se o utilizador as fornecer. Não é necessário ter linhas para que a fatura seja válida.
- **Criação de fornecedor durante confirmação**: `ConfirmImportedInvoiceUseCase` aceita o campo `newSupplier` (nome + NIF opcional). Quando presente, chama `SupplierCreatePort.create()` e usa o ID retornado — `newSupplier` tem precedência sobre `supplierId`. O adapter concreto (`FinancialBaseSupplierCreateAdapter`) delega ao módulo `financial-base`. A consulta de fornecedor existente por NIF é feita via `SupplierLookupPort`.
- **`confirmImport` transita para `pending`, `paid` ou `pending` com DD**: se "Fatura já paga" → `paid`; se "Débito direto" → `pending` com `isDirectDebit=true` e `directDebitDate`; caso contrário `pending`.
- **Débito direto e "já paga" são mutuamente exclusivos**: o frontend impede selecionar ambos; o backend aceita `isDirectDebit` independentemente de `markAsPaid`, mas a semântica esperada é exclusiva.
- **Débito direto não cria payable entry**: quando o utilizador confirma uma fatura com `isDirectDebit=true`, o `saveAsPayable` é forçado a `false` no frontend e ignorado no backend — não faz sentido ter uma entrada a pagar para algo que será debitado automaticamente. O processamento do cron sincroniza o payable entry existente (se houver) via `markPaidByInvoiceId`.
- **Processamento de DD via cron**: `ProcessDirectDebitsUseCase` lê faturas com `directDebitDate ≤ hoje` e status não pago/cancelado (`paid`/`cancelled` excluídos; `overdue` é elegível), marca-as como pagas na `directDebitDate` e sincroniza o payable entry.
- **Filtro `status=overdue` em `ListInvoicesUseCase` é sempre derivado, nunca reenviado ao repositório como igualdade literal**: como nada persiste `status="overdue"` (ver "Conceitos do domínio"), o repositório (`.eq("status", "overdue")`) devolvia sempre lista vazia — bug reportado pelo utilizador ("a filtrar as faturas vencidas não filtra nada"). O use case agora intercepta este valor antes de montar o filtro do repositório e aplica, em memória, o mesmo critério já usado em `GetInvoiceAlertsUseCase` (não paga/cancelada/rascunho + `dueDate` antes de hoje). Os restantes filtros (fornecedor, datas, pesquisa, etc.) continuam a combinar normalmente com este.
- **`internalCronRoutes` como factory**: o ficheiro `src/routes/internalCronRoutes.ts` exporta `createInternalCronRouter(deps)` em vez de uma instância singleton. Isto evita que o módulo `invoices` seja instanciado duas vezes (uma no `server.ts` e outra na criação das rotas cron), o que criaria dois clientes Supabase separados. O `server.ts` passa `{ processDirectDebits: invoicesModule.processDirectDebits, listOrganizations }` já instanciados — `listOrganizations` vem de `src/infra/scoped-db/organization-listing.ts` (ticket 02), não do módulo `invoices`.
- **`InvoicesModule` expõe `listInvoices`/`listInvoiceLines` (módulo `accounting`, D10)**: além de `router`/`processDirectDebits`, o composition root agora devolve os use cases `ListInvoicesUseCase`/`ListInvoiceLinesUseCase` já instanciados, para o módulo `accounting` os injetar diretamente (sem adapter de tradução — os DTOs já são o que precisa) em `ListAccountingDocumentsUseCase`/`GetVatOverviewUseCase`. Mesmo padrão já usado por `cash-closings`/`sales-summary` com `air-menu`/`vendus`.
- **Fan-out do cron de débitos diretos (spec C ticket 06)**: `POST /api/internal/cron/process-direct-debits` deixou de processar só o `UNATTENDED_SCOPE.organizationId` fixo — agora lista todas as organizações (`listOrganizations()`) e chama `ProcessDirectDebitsPort.execute(organizationId)` uma vez por organização através do utilitário genérico `fanOut` (`src/utils/fan-out.ts`, ticket 02). Ao contrário do cron `daily-vendus-consumption` (ticket 05, não implementado), este cron não depende de credenciais Vendus/AirMenu — opera sobre `invoices`/`payable_entries` já filtradas por `org_id` — por isso não há caso de skip "não configurado"; o processor nunca devolve `not_configured`, só falha isolada por organização (uma exceção numa organização não impede as restantes, apanhada e registada pelo `fanOut`). A resposta HTTP devolve o `FanOutSummary` completo (`succeeded`/`skipped`/`failed`); o log por organização (sucesso ou falha) é responsabilidade do `fanOut`, não deste route handler.
- **Proteção contra duplicados — dois caminhos, com preferência por `supplierId`**:
  - `findDuplicate(invoiceNumber, supplierId)` é sempre preferido quando há um fornecedor resolvido — no import/confirm isso inclui matches por hint ou fuzzy de nome, não só por NIF. `findDuplicateByNif(invoiceNumber, supplierNifSnapshot)` só é usado como fallback quando nenhum fornecedor foi identificado.
  - **Bug corrigido (set/2026)**: `ImportInvoiceUseCase` e `ConfirmImportedInvoiceUseCase` exigiam `extraction.supplierNif`/`supplierNifSnapshot` truthy para sequer tentar a verificação — se a IA não extraía o NIF nesse scan (comum), a checagem era saltada por completo mesmo com o fornecedor correctamente resolvido por hint/fuzzy. Ambos os use cases agora tentam `findDuplicate` por `supplierId` primeiro.
  - `findDuplicate`/`findDuplicateByNif` (`SupabaseInvoiceRepository`) toleram diferenças de capitalização no número da fatura (`ilike` sem wildcards) e de formatação no NIF (`normalizeNif` aplicado no filtro, comparado em memória — `supplier_nif_snapshot` é gravado tal como extraído/editado, sem normalização própria).
  - Na importação é um aviso (`validationIssues: ["duplicate_invoice"]`); na confirmação é um erro que bloqueia (409 `DuplicateInvoiceError`); na criação manual também bloqueia.
  - **`InvoiceDTO.isDuplicate`**: calculado em `ListInvoicesUseCase` a cada listagem (não persistido), via `findDuplicateInvoiceIds` (`domain/utils/duplicate-detection.ts`) — agrupa as faturas devolvidas por `supplierId` (ou NIF normalizado, se não houver fornecedor ligado) + número normalizado, ignorando canceladas; grupos com mais de uma fatura ficam marcados. Não persistir evita ficar desactualizado quando uma duplicada é cancelada ou o número é corrigido, mas também significa que só deteta duplicados **dentro da lista devolvida** — uma listagem filtrada por `status` não vê duplicados noutro estado.
- **Nunca aceitar a própria organização como fornecedor de uma fatura importada (`ImportInvoiceUseCase`, set/2026)**: a IA de visão por vezes lê a secção de faturação/cliente da fatura (a nossa própria empresa) em vez do emitente real, e devolve o NIF/nome da organização como se fosse o fornecedor — mais provável quando o emitente tem um layout invulgar ou a extração falha a distinguir "emitente" de "cliente". Como o NIF da organização se mantém constante mesmo quando a razão social muda (ex: "Raul Afonso e Mariana Cavalcanti Lda" → "Angry Box Lda", mesmo NIF), o `ImportInvoiceUseCase` compara `normalizeNif(extraction.supplierNif)` contra `OrganizationIdentityReadPort.getNif(organizationId)` logo a seguir à extração; se coincidirem, tanto `supplierNif` como `supplierName` são descartados (tratados como `null`) **antes** de entrarem na cadeia de resolução de fornecedor (NIF → hint → fuzzy) e antes de serem gravados na fatura — a fatura fica com `supplierName: "Fornecedor desconhecido"`, sem `supplierId` nem `supplierNifSnapshot`, e ganha o novo `validationIssues` `"supplier_is_own_company"` (mostrado no drawer de revisão) além do `"no_supplier_match"` habitual, forçando o utilizador a identificar o fornecedor real manualmente. `OrganizationIdentityReadPort` (`domain/ports/out/organization-identity-read.port.ts`) é um port cross-module local a `invoices` (D10) — `SupabaseOrganizationIdentityReadAdapter` lê a coluna `nif` da tabela `organizations` directamente, sem importar código do módulo `financial-base` (que já tem o seu próprio `OrganizationIdentityPort` mais rico, usado no PDF de extrato de fornecedor — os dois não se conhecem, é a mesma tabela lida de dois módulos por interfaces próprias e mais estreitas cada uma).
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
- **Validação de totais de linhas (modo detalhado)**: ao adicionar ou editar uma linha, a soma das linhas não pode exceder `totalWithVat` da fatura com tolerância de 1 cêntimo. Somas parciais abaixo do total são permitidas (utilizador pode adicionar linhas incrementalmente). Apenas `totalWithVat` é verificado — `vatAmount` e `subtotalWithoutVat` são campos derivados que em faturas importadas por IA podem ter arredondamentos diferentes dos valores cabeçalho, causando falsos positivos. Esta validação aplica-se a `AddInvoiceLineUseCase` e `UpdateInvoiceLineUseCase`.
- **Cleanup de dependências ao apagar fatura**: `DeleteInvoiceUseCase` cancela o payable entry e remove os links de conciliação bancária antes de apagar a fatura e as linhas. Ordem garantida: (1) apagar linhas, (2) remover links de reconciliação + recalcular movimentos afectados, (3) cancelar payable entry, (4) apagar fatura, (5) apagar ficheiro em storage. `InvoiceReconciliationCleanupPort` é declarado no módulo `invoices` para evitar acoplamento ao módulo `bank-statements`; o adapter concreto acede directamente às tabelas `bank_movement_entity_links` e `bank_movements`.
- **Renumber propagation no UpdateInvoice**: quando `invoiceNumber` muda, o use case actualiza a `description` do payable entry (via `renumberByInvoiceId`) e o `entity_label` dos links de conciliação bancária (via `renumberLinksForInvoice`). A propagação só ocorre quando o número realmente muda (não quando é omitido nem quando é igual ao actual).
- **lineDetailMode automático no ConfirmImport**: quando o utilizador fornece linhas ao confirmar uma fatura importada, o use case define automaticamente `lineDetailMode=detailed` e persiste a fatura actualizada antes de criar o payable entry — garantindo que o DTO retornado reflecte o modo correcto.
- **Alocação de linha a uma loja (`locationId`, spec B2 D3/D4/D5)**: `invoice_lines` é a única tabela location-bearing cujo `location_id` é **nullable** — todas as outras (event-grain: `cash_closings`, `stock_movements`, `hr_work_shifts`, `hr_shift_attendance`) exigem uma loja. Aqui, `null` é um estado real e não a ausência de um dado: um custo pode pertencer à organização inteira (ex: marketing central, serviços partilhados) e a nenhuma loja específica. Por isso o campo é opcional em todas as escritas de linha (`AddInvoiceLineUseCase`, `UpdateInvoiceLineUseCase`, linhas de `CreateInvoiceUseCase` e de `ConfirmImportedInvoiceUseCase`) e **nunca é defaultado** — ausente na escrita fica `null` na base de dados, não uma loja adivinhada. O cabeçalho da fatura (`invoices`) continua ao nível da organização; só a linha carrega a loja. O frontend só começa a enviar o campo no ticket 19 da spec B2 — até lá fica ausente na prática. Uma loja indicada por um caller que pertença a outra organização será rejeitada pela FK composta `(org_id, location_id)` quando essa migração aterrar (D5, ticket 21) — hoje ainda não há essa validação estrutural.
- **Organização explícita em todas as portas de saída (spec B2 D1/D2/D7, ADR-0008)**: cada adapter deixou de guardar um `SupabaseClient` e passou a receber `createScopedQuery` (`ScopedQueryFactory`), construindo um `ScopedQuery` escopado por chamada. A organização (`OrganizationId`, tipo nominal — `src/kernel/organization-id.ts`) chega pelo `organizationId` do comando nos casos de uso baseados em objecto, e como primeiro parâmetro posicional nos que tomam argumentos primitivos. O controller lê-a de `req.auth.orgId`; o cron de débitos diretos (`POST /api/internal/cron/process-direct-debits`, sem sessão) já não usa o `UNATTENDED_SCOPE` fixo — desde a spec C (ticket 06) recebe um `OrganizationId` por chamada, um por organização listada, ver "Fan-out do cron de débitos diretos" acima. `AiExtractionPort` fica de fora deliberadamente — nunca toca a base de dados (fala com a OpenAI). `DocumentStoragePort` recebe `organizationId` como último argumento de `store` (não o primeiro) desde ADR-0015 — não toca a base de dados directamente, mas o wrapper `objectStorage` usa a organização para prefixar o caminho de upload em `invoice-documents`.

- **Notas de Crédito (`documentType`, set/2026) — sinal sempre normalizado pela entidade, nunca pelo chamador**: `invoices.document_type` (`"invoice" | "credit_note"`, default `"invoice"`). `Invoice.normalizeAmountSign` é chamado em `create`/`createFromImport`/`update`/`confirmImport` e força `subtotalWithoutVat`/`totalVat`/`totalWithVat` para a magnitude positiva (fatura) ou negativa (nota de crédito) **a partir do valor absoluto recebido** — quem chama pode sempre passar o valor tal como aparece no documento (positivo), nunca precisa de inverter o sinal manualmente. Reaplicado mesmo quando só `documentType` muda (sem tocar nos valores), para nunca ficar sinal/tipo inconsistentes. Como todas as agregações de saldo do fornecedor já eram somas simples de `total_with_vat` (`SupabaseSupplierInvoiceStatsAdapter`, `GetSupplierStatementUseCase`), guardar o total já negativo bastou para relatórios/saldos ficarem corretos **sem alterar essa lógica**.
  - Deteção automática: `OpenAiExtractionAdapter` pede à IA para identificar termos ("Nota de Crédito", "NC", "Credit Note") e devolver `documentType`; `ImportInvoiceUseCase` só aceita a sugestão da IA quando o utilizador não escolheu explicitamente no upload (`ImportInvoiceCommand.documentType`, enviado como campo de formulário `documentType` junto do multipart `file` em `POST /invoices/import` — tem sempre prioridade sobre a IA). Quando é a IA a decidir sozinha, entra `validationIssues: ["credit_note_detected"]` para forçar revisão humana no drawer; quando o utilizador já escolheu, não.
  - **Nunca cria payable entry para uma nota de crédito**: `ConfirmImportedInvoiceUseCase` ignora `saveAsPayable` quando `documentType === "credit_note"` — `PayableEntry.amount` exige `> 0` e uma nota de crédito não é "conta a pagar".
  - **Excluída dos *pickers* de vínculo/conciliação (não da listagem principal)**: `ListInvoicesFilter.documentType` (usado por quem quer só faturas, ex. `LinkInvoiceModal` de `payable-recurrences`, picker "Justificar com fatura" de `bank-statements`) e `InvoiceMatchReadPort.findCandidates` (`bank-statements`, sugestões automáticas de conciliação) filtram `document_type = 'invoice'`. `findByIds` fica sem filtro (lookup por id já conhecido).
  - **Fora desta fase, deliberadamente**: vínculo Nota de Crédito ↔ Fatura específica (abater o saldo de uma fatura em concreto), "crédito disponível do fornecedor" como saldo rastreado à parte, e o badge "NC" no PDF do extrato do fornecedor (`GetSupplierStatementUseCase` já devolve `documentType`, mas o renderer do PDF no frontend ainda não o usa).

- **Bug corrigido (set/2026) — `stockReviewOverride`/`stockReviewOverrideReason` silenciosamente ignorados em `UpdateInvoiceUseCase`**: `UpdateInvoiceCommand` já declarava estes dois campos (e `UpdateInvoiceData`/`Invoice.update()` já os suportavam, herdados de `createFromImport`/`confirmImport`), mas `UpdateInvoiceUseCase.execute()` nunca os copiava para o `data` passado a `existing.update(data)` — mudar "Impacto no stock" numa fatura já finalizada não tinha **nenhum** efeito, sem erro nenhum, só descoberto ao reproduzir o bug do crash abaixo. Corrigido: os dois campos são aplicados a `data` como qualquer outro campo opcional do comando.
- **Guard partilhado contra revisão de stock órfã (`shared-stock-review-guard.ts`) — o crash original e o fix**: mudar "Impacto no stock" (`stockReviewOverride`), voltar de `detailed` para `simple` (que apaga `invoice_lines` via `deleteByInvoiceId`), ou **eliminar a fatura por completo** (`DeleteInvoiceUseCase`, mesmo `deleteByInvoiceId`) podia colidir com uma revisão de stock (`stock_purchase_reviews`/`stock_review_lines`, módulo `stock-purchase-review`) já criada a partir dessas linhas pelo gancho fire-and-forget de finalização — a FK `stock_review_lines_invoice_line_id_fkey` não tem `ON DELETE CASCADE` (D2/regra "nunca hard delete" desse módulo) e o Postgres recusava o delete, surgindo como erro bruto na UI (ex.: "Eliminar fatura" a falhar sempre que a fatura tinha uma revisão associada, set/2026). Corrigido com um guard partilhado por `UpdateInvoiceUseCase` (quando `stockReviewOverride` muda), `SetLineDetailModeUseCase` (quando `detailed → simple` ia mesmo apagar linhas) e `DeleteInvoiceUseCase` (sempre, antes de qualquer cleanup): lê o estado da revisão via `InvoiceStockReviewStatusReadPort` (D10) e decide — sem revisão associada, prossegue normalmente; revisão já `applied` (gerou movimentos reais), bloqueia sempre com `InvoiceLinesLockedByAppliedStockReviewError` (409), nunca aceita confirmação — mesmo ao eliminar a fatura, o utilizador tem de desfazer a entrada de stock primeiro; revisão ainda não aplicada, só prossegue com `confirmRemoveStockReview: true` explícito no pedido — sem essa confirmação lança `StockReviewRemovalConfirmationRequiredError` (409 `{error, requiresConfirmation: true}`), nunca descarta a revisão silenciosamente. Com a confirmação, o guard pede a `stock-purchase-review` (via `InvoiceStockReviewDraftDeletePort`, D10) para apagar fisicamente esse rascunho — a única forma de tornar o `deleteByInvoiceId` seguro sem introduzir `ON DELETE CASCADE` na FK (que apagaria dados legítimos de outros fluxos sem auditoria).
- **Padrão HTTP "confirmar-depois-repetir" em dois passos (409 com `requiresConfirmation`)**: quando o guard acima exige confirmação, o controller devolve 409 com `{ error, requiresConfirmation: true }` — um sinal estruturado distinguível de um 409 de bloqueio puro (`DuplicateInvoiceError`, `InvoiceLinesLockedByAppliedStockReviewError`, sem esse campo), mesma convenção de anexar campos extra ao 409 já usada por `StaleReviewVersionError` (`currentVersion`) no módulo `stock-purchase-review`. O frontend mostra um diálogo com a mensagem do erro e, se o utilizador confirmar, reenvia o mesmo pedido com `confirmRemoveStockReview: true` — nunca assume a confirmação silenciosamente. Em `PATCH /invoices/:id` e `PATCH /invoices/:id/line-detail-mode` vai no corpo; em `DELETE /invoices/:id` (sem corpo) vai como query string (`?confirmRemoveStockReview=true`), lido em `req.query`.

- **Identidade fiscal partilhada (F1 v1.2, ADR-0039)**: criar, confirmar e corrigir o número/tipo de uma fatura finalizada reserva a identidade fiscal (`claimFiscalIdentity`); conflito → `FiscalIdentityConflictError` (409 com `code`: `existing_finance` | `existing_stock_only` | `possible_duplicate` | `identity_incomplete`). Documento já movimentado no Stock é completado sem nova revisão de stock (`force_skip`). A importação devolve o documento existente (`reused: "same_file"` por SHA-256, sem nova chamada à IA; `"same_fiscal_identity"`) em vez de criar outro rascunho. Apagar liberta a chave.
- **Uma obrigação por documento (F1)**: total/vencimento de uma fatura finalizada acompanham a conta a pagar em aberto; se já está paga e o total muda → `InvoicePayableSettledError` (409 `payable_settled`; corrigir por NC/ajuste). `GET /invoices/integrity/payable-duplicates` lista faturas com mais de uma obrigação ativa (nunca corrige sozinho).
- **Motor único de valores ao finalizar (F1 §1.3)**: `CreateInvoiceUseCase` e `ConfirmImportedInvoiceUseCase` recalculam no servidor com `computeInvoiceAmounts` (kernel/money, decimal exato) — os totais enviados pelo cliente nunca são confiados. Com linhas, base e IVA da fatura passam a ser os do motor (IVA por taxa, repartido pelas linhas com soma exata); sem linhas, base + IVA + ajustes tem de dar o total. Só finaliza com diferença 0 ao cêntimo; caso contrário `InvoiceAmountsNotReconciledError` (422 `amounts_not_reconciled`, com `differenceCents` e `issues`) e nada é gravado — o rascunho importado fica como estava. Ajuste de arredondamento: política explícita de no máximo 1 cêntimo por taxa de IVA, com motivo (≥ 5 caracteres) gravado; acima disso é divergência real. Taxa de IVA em falta nunca é 0%. Notas de crédito: cálculo em valor absoluto, sinal reposto pela entidade. Faturas antigas não são recalculadas (sem efeitos retroativos): as colunas novas ficam a null.
- **Versão e auditoria (F1 §1.4)**: `invoices.version` (faturas antigas começam em 1). `UpdateInvoiceUseCase` e `ConfirmImportedInvoiceUseCase` aceitam `expectedVersion`; diferente da atual ou outra escrita a passar à frente (`claimVersion` condicional) → `InvoiceVersionConflictError` (409 `version_conflict`, `currentVersion`). Confirmar usa sempre a versão lida como esperada, por isso dois cliques/sessões a confirmar o mesmo rascunho nunca finalizam duas vezes. Criar, confirmar, editar e apagar gravam auditoria (autor da sessão, origem, antes/depois dos campos de valor/identidade, motivo — `reason` no corpo do PATCH ou `?reason=` no DELETE). A auditoria é escrita depois da operação e uma falha propaga (500) — preferimos um erro visível a uma alteração sem registo; com `Idempotency-Key` o cliente pode repetir em segurança. Ainda sem versão: marcar como paga, mudar estado e as operações de linha (fora do âmbito F1).
- **Bug corrigido (F1)**: `CreateInvoiceUseCase` ignorava `documentType` (uma NC criada à mão ficava como fatura); agora é aplicado e, como no confirmar, nunca cria conta a pagar para uma nota de crédito.

**Documento de pagamento com várias faturas fiscais (2026-10-26, ADR-0041).** Um PDF com N QR
fiscais (ex.: águas: água/saneamento + resíduos, emitentes diferentes, um só débito) cria N
rascunhos: a 1.ª fatura com a leitura normal; as outras a partir do seu QR (emitente pelo NIF,
uma linha por taxa, mesmo prazo), sem nova chamada à IA. Os novos ficam com o mesmo
`payment_group_id` (se gravar o grupo falhar, as faturas ficam). A resposta traz os outros em
`siblings`; a importação em lote grava as linhas de cada um. O ficheiro só é apagado se todas as
faturas já existiam.

**Linhas conferidas com o QR (2026-10-26).** Fatura com QR lida pela IA: as linhas só ficam se
fecharem ao cêntimo com as bases do QR (total e, quando dá, por taxa); senão ficam uma linha por
taxa do QR (`enforceQrLines`, aviso `lines_replaced_by_qr`) — a fatura fecha sempre e pode ser
confirmada.

**Fornecedor com QR (2026-10-26).** O NIF do emitente vem do QR (certificado): um fornecedor
achado pela dica ou pela semelhança do nome com outro NIF é recusado (fica «fornecedor não
encontrado»); se essa ficha tiver o NIF da própria empresa (o cliente da fatura), aviso
`supplier_record_has_own_nif`.

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
-- Políticas RLS de storage.objects (ticket 05, ADR-0015):
-- supabase/migrations/20260909140000_invoice_documents_storage_rls.sql
```

`org_id` (NOT NULL, com default temporário) em `invoices` e `invoice_lines`, e
`location_id` (nullable, sem default) em `invoice_lines`, já existem —
adicionadas por `supabase/migrations/20260822150000_tenancy_schema_pass.sql`
(spec B2's foundation), não por este ticket. Este ticket não altera o schema;
apenas faz o código passar a escrever/ler através do `ScopedQuery` e a aceitar
`locationId` nas escritas de linha.

### `20261130110000_invoice_payment_group`
`invoices.payment_group_id uuid` + índice `(org_id, payment_group_id)` parcial. Rollback em `docs/migrations/rollback/`.

## Como testar

- Domínio/use cases: `npx jest --testPathPattern="src/modules/invoices" --no-coverage`
- Leitor determinístico: `npx jest --testPathPattern="src/modules/invoices/__tests__/domain/reading"`; prova com faturas reais (fora do repo, só local): `npx tsx "C:/Users/Bruno Fontes/faturas-teste-privado/verify-reader.mts"` (`--all <pasta>` para lotes).
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
- **`invoice-documents` continua um bucket público sem backfill (ADR-0015, tickets 03/05)**: PDFs de faturas importadas antes destas mudanças ficam em caminhos sem prefixo de organização, para sempre — nunca são migrados. As políticas RLS novas não protegem quem já tem o URL de uma fatura (ver "Decisões de design" acima) nem convertem o bucket para privado — isso é uma decisão de produto explicitamente fora de âmbito (DB3).
