# Módulo: invoices

> Status: ativo
> Última atualização: 2026-07-01

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
Fluxo de importação inteligente (novo):
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

Fluxo manual (mantido):
1. Manager introduz a fatura manualmente
2. A fatura fica em estado "Pendente"
3. Manager classifica as linhas por tipo e centro de custo
4. Quando paga, regista a data → estado "Paga"
```

**Conceitos-chave para o negócio:**

- **Fatura** — documento emitido por um fornecedor com o valor a pagar e a data
  limite. Estados: *Rascunho IA*, *Pendente Revisão*, *Pendente* (por pagar),
  *Paga*, *Vencida*, *Parcial*, *Cancelada*, *Em revisão* (legado).
- **Importação inteligente** — fluxo onde o utilizador envia o documento original
  e a IA extrai automaticamente os dados. O utilizador apenas valida/corrige antes
  de confirmar.
- **Linha de fatura** — detalhe do que foi comprado/contratado. Opcional no MVP;
  o sistema regista sempre os totais da fatura e aceita linhas quando fornecidas.
- **Regra de classificação** — por fornecedor, memoriza centro de custo, tipo
  financeiro e categoria para faturas futuras.
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
    `isDirectDebit`, `directDebitDate`.
  - `costCenterCategoryId` ao nível da fatura propaga automaticamente para todas as
    linhas ao confirmar importação ou ao actualizar a fatura.
  - Factory `createFromImport()` para faturas criadas pelo fluxo IA.
  - Método `confirmImport()` para transitar `draft_ai` → `pending`.
- **InvoiceLine** — linha de detalhe. Classificação simplificada: apenas `type` e
  `costCenterCategoryId` (removidos `costCenterId`, `category`, `subcategory`).
  `affectsDre`, `affectsCashflow`, `affectsProfitability` herdados do cabeçalho.
- **ClassificationRule** — regra determinística por `supplierId`: guarda `type` e
  `costCenterCategoryId` (campos `costCenterId`/`category` removidos).
- **AiExtractionResult** — value object com os dados extraídos pela IA + confidence + validationIssues.
- **InvoiceStatus**: `draft_ai | pending_review | pending | paid | overdue | partial | cancelled | review`
- **InvoiceSource**: `manual | pdf_import | image_import`
- Todos os valores monetários em **cêntimos** (inteiros).

## Ports

### Entrada (use cases)

- `CreateInvoiceUseCase` — criação manual com linhas opcionais; cria payable entry se dueDate presente.
- `UpdateInvoiceUseCase` — actualiza campos do cabeçalho (inclui novos campos de classificação financeira).
- `MarkInvoicePaidUseCase` — transita para `paid`, sincroniza payable entry.
- `SetInvoiceStatusUseCase` — força estado arbitrário; cancela payable entry se `cancelled`.
- `AddInvoiceLineUseCase` — adiciona linha a fatura existente.
- `ClassifyInvoiceLineUseCase` — classifica linha; opcionalmente cria/actualiza `ClassificationRule`.
- `SuggestLineClassificationUseCase` — sugestão de classificação por fornecedor.
- `ListInvoicesUseCase` — filtra por fornecedor, CC, estado, intervalo de datas, `isDirectDebit`.
- **`ProcessDirectDebitsUseCase`** *(novo)* — busca faturas de DD com `directDebitDate ≤ hoje` e status não pago/cancelado; marca-as como pagas na `directDebitDate` e sincroniza payable entries.
- `ListInvoiceLinesUseCase` — todas as linhas (para analytics por CC).
- `GetInvoiceUseCase` — detalhe com linhas.
- `DeleteInvoiceUseCase` — remove fatura, linhas e ficheiro em storage (se tiver `attachmentUrl`).
- **`ImportInvoiceUseCase`** *(novo)* — armazena ficheiro, extrai dados via IA, procura fornecedor por NIF, aplica defaults, cria `Invoice` em `draft_ai`.
- **`ConfirmImportedInvoiceUseCase`** *(novo)* — aplica correções do utilizador, transita `draft_ai`/`pending_review` → `pending`; salva linhas opcionais; cria payable entry se pedido. Suporta `newSupplier` (cria fornecedor via `SupplierCreatePort` antes de guardar) e propaga `costCenterCategoryId` para todas as linhas.
- **`GetInvoiceAlertsUseCase`** *(novo)* — devolve contagens e valores para os 8 tipos de alerta.

### Saída (dependências do domínio)

- `InvoiceRepositoryPort` — CRUD de faturas + `findAll(filter?)` + `findPendingDirectDebits()`.
- `InvoiceLineRepositoryPort` — `saveAll`, `save`, `findByInvoiceId`, `findAll`, `updateLine`, `deleteByInvoiceId`, `updateCostCenterCategoryForInvoice` (bulk update do CC de todas as linhas).
- `ClassificationRuleRepositoryPort` — `findBySupplierId`, `save`, `update`.
- `PayableEntryWritePort` — cria/marca-pago/cancela entradas em `payable_entries`.
- **`AiExtractionPort`** *(novo)* — `extract(fileUrl, mimeType): Promise<AiExtractionResult>`.
- **`DocumentStoragePort`** *(novo)* — `store(buffer, filename, mimeType): Promise<string>`.
- **`SupplierLookupPort`** *(novo)* — `findByNif(nif)` + `findByName(query)`. Inclui defaults do fornecedor.
- **`SupplierCreatePort`** *(novo)* — `create(data)` para criar fornecedor durante confirmação de importação.

## Adapters

### Entrada

- `createInvoiceRouter` → expõe use cases via REST em `/api/invoices`.

### Saída

- `SupabaseInvoiceRepository` → tabela `invoices` (actualizado com novos campos).
- `SupabaseInvoiceLineRepository` → tabela `invoice_lines`; inclui `updateCostCenterCategoryForInvoice`.
- **`FinancialBaseSupplierCreateAdapter`** *(novo)* → delega criação de fornecedor ao financial-base.
- `SupabaseClassificationRuleRepository` → tabela `classification_rules`.
- `SupabasePayableEntryWriteAdapter` → tabela `payable_entries`.
- **`SupabaseDocumentStorageAdapter`** *(novo)* → bucket Supabase Storage `invoice-documents`.
- **`SupabaseSupplierLookupAdapter`** *(novo)* → tabela `suppliers` (NIF + defaults).
- **`OpenAiExtractionAdapter`** *(novo)* → GPT-4o Vision, devolve JSON estruturado.

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/invoices/lines` | Todas as linhas (para analytics por CC) |
| GET | `/api/invoices` | Lista faturas (query: `supplierId`, `costCenterId`, `status`, `from`, `to`, `isDirectDebit`) |
| GET | `/api/invoices/alerts` | **Novo** — KPIs de alertas operacionais |
| GET | `/api/invoices/suggest-classification/:supplierId` | Sugestão de classificação |
| GET | `/api/invoices/:id` | Detalhe com linhas |
| POST | `/api/invoices` | Criar fatura manualmente (com linhas opcionais) |
| POST | `/api/invoices/import` | **Novo** — importar PDF/imagem via IA (multipart `file`) |
| POST | `/api/invoices/:id/confirm` | **Novo** — confirmar fatura importada |
| PATCH | `/api/invoices/:id` | Actualizar cabeçalho |
| PATCH | `/api/invoices/:id/paid` | Marcar como paga |
| PATCH | `/api/invoices/:id/status` | Forçar estado |
| DELETE | `/api/invoices/:id` | Eliminar fatura e linhas |
| POST | `/api/invoices/:invoiceId/lines` | Adicionar linha a fatura existente |
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

## SQL — alterações às tabelas

```sql
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

## Pontos de atenção / dívidas conhecidas

- `suppliers` precisa das colunas `default_cost_center_group_id`, `default_cost_center_category_id`, `default_financial_type` para o fluxo de aplicação de defaults funcionar.
- `stock_item_id` e `stock_entry_id` nas linhas estão preparados para o módulo `stock-valuation`.
- `cost_center_id` (legado) ainda existe nas tabelas `invoice_lines` e `classification_rules`. Remover após confirmação de que nenhum dado activo depende dele.
- `ListInvoiceLinesUseCase` devolve todas as linhas sem paginação.
- Importação automática por email não implementada (fora do scope do MVP).
