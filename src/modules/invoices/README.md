# Módulo: invoices

> Status: ativo
> Última atualização: 2026-06-16

## O que é e para que serve (perspectiva de negócio)

Todos os meses chegam dezenas de faturas à Angrybox — da Makro, da EDP, da NOS,
de plataformas de marketing, de fornecedores de embalagens. Sem um sistema, essas
faturas ficam em papel, em email ou numa pasta de computador, e o manager não sabe
ao certo o que deve, quando vence, nem quanto gastou por área.

**O problema que resolve:**
Perder uma fatura vencida significa juros ou interrupção de serviço. Não saber
o total de custos por centro de custo impede qualquer análise financeira. Este
módulo centraliza todas as faturas, dá visibilidade sobre o estado de cada uma
(por pagar, paga, vencida) e permite classificar cada despesa pela área da empresa
a que pertence.

**O fluxo do ponto de vista do negócio:**

```
Manager (backoffice)
────────────────────────────────────────────────────────────────
1. Chega uma fatura (email, papel, PDF)
2. Manager introduz a fatura no sistema:
   fornecedor, número, data de emissão, data de vencimento, valores
3. A fatura fica em estado "Pendente"
4. Manager abre a fatura e classifica as linhas:
   — tipo de despesa (ingredientes, serviço, custo fixo, …)
   — centro de custo (OPE, ADM, MKT, …)
   — opcionalmente guarda a classificação como regra automática
     para futuras faturas do mesmo fornecedor
5. Quando a fatura é paga, manager regista a data de pagamento
   → estado passa para "Paga"
6. Se a data de vencimento passar sem pagamento, o sistema
   assinala a fatura como "Vencida" e destaca-a nos KPIs
```

**Conceitos-chave para o negócio:**

- **Fatura** — documento emitido por um fornecedor com o valor a pagar e a data
  limite. Tem sempre um estado: *Pendente* (ainda não paga), *Paga*, *Vencida*
  (prazo ultrapassado), *Parcial* (pagamento parcial), *Cancelada* ou *Em revisão*.
- **Linha de fatura** — detalhe do que foi comprado/contratado. Uma fatura da Makro
  pode ter uma linha de "Farinha T55" (stock, OPE) e outra de "Material de limpeza"
  (operacional, OPE). A classificação por linha permite relatórios precisos.
- **Regra de classificação** — quando o manager classifica manualmente uma linha e
  marca "guardar como regra", o sistema memoriza que faturas daquele fornecedor
  devem ser classificadas da mesma forma. A confiança da regra cresce a cada
  confirmação — assim o sistema torna-se progressivamente mais preciso.
- **Vencimento** — data limite de pagamento. O sistema calcula automaticamente quais
  as faturas vencidas e mostra o total em euros em destaque (vermelho) nos KPIs.

---

## Propósito técnico

Gestão de faturas de fornecedores: criação, atualização, ciclo de vida (pending → paid/cancelled/overdue), classificação de linhas por tipo e centro de custo, e sugestão automática de classificação com base em regras por fornecedor. Não é responsável por extratos bancários, reconciliação ou relatórios financeiros — esses módulos existem separadamente.

## Conceitos do domínio

- **Invoice** — fatura de compra com cabeçalho (fornecedor, valores, datas, estado). Imutável; `markPaid`, `cancel`, `setStatus` devolvem nova instância.
- **InvoiceLine** — linha de detalhe de uma fatura. Tem tipo (`InvoiceLineType`), centro de custo e categoria opcionais. `classify()` devolve nova instância.
- **ClassificationRule** — regra determinística por `supplierId`: sugere centro de custo e tipo de linha para novas faturas desse fornecedor. `confidenceBoost` aumenta 10 pontos a cada confirmação manual (máx 100).
- **InvoiceStatus**: `pending | paid | overdue | partial | cancelled | review`
- **InvoiceLineType**: `stock_purchase | operational_expense | fixed_cost | variable_cost | tax | bank_fee | salary | internal_transfer | service | mixed | other`
- Todos os valores monetários em **cêntimos** (inteiros).

## Ports

### Entrada (use cases)

- `CreateInvoiceUseCase` — cria fatura com linhas opcionais; persiste em `invoices` + `invoice_lines`.
- `UpdateInvoiceUseCase` — actualiza campos do cabeçalho (não altera linhas nem estado).
- `MarkInvoicePaidUseCase` — transita para `paid`, define `paidAt` (default: hoje); lança erro se cancelada.
- `SetInvoiceStatusUseCase` — força transição de estado arbitrária (uso administrativo).
- `ClassifyInvoiceLineUseCase` — classifica uma linha; opcionalmente cria/actualiza `ClassificationRule`.
- `SuggestLineClassificationUseCase` — devolve sugestão para o fornecedor (score 0.5–1.0).
- `ListInvoicesUseCase` — filtra por fornecedor, centro de custo, estado, intervalo de datas.
- `GetInvoiceUseCase` — devolve fatura com linhas incluídas.
- `DeleteInvoiceUseCase` — remove fatura e respectivas linhas.

### Saída (dependências do domínio)

- `InvoiceRepositoryPort` — CRUD de faturas + `findAll(filter?)`.
- `InvoiceLineRepositoryPort` — `saveAll`, `findByInvoiceId`, `updateLine`, `deleteByInvoiceId`.
- `ClassificationRuleRepositoryPort` — `findBySupplierId`, `save`, `update`.

## Adapters

### Entrada

- `createInvoiceRouter` → expõe os use cases via REST em `/api/invoices` e `/api/invoices/:id/lines/:lineId/classify`.

### Saída

- `SupabaseInvoiceRepository` → tabela `invoices`.
- `SupabaseInvoiceLineRepository` → tabela `invoice_lines`.
- `SupabaseClassificationRuleRepository` → tabela `classification_rules`.

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/invoices` | Lista faturas (query: `supplierId`, `costCenterId`, `status`, `from`, `to`) |
| GET | `/api/invoices/:id` | Detalhe com linhas |
| POST | `/api/invoices` | Criar fatura (com linhas opcionais) |
| PATCH | `/api/invoices/:id` | Actualizar cabeçalho |
| PATCH | `/api/invoices/:id/paid` | Marcar como paga (`{ paidAt?: "YYYY-MM-DD" }`) |
| PATCH | `/api/invoices/:id/status` | Forçar estado (`{ status }`) |
| DELETE | `/api/invoices/:id` | Eliminar fatura e linhas |
| PATCH | `/api/invoices/:invoiceId/lines/:lineId/classify` | Classificar linha (`{ classify, saveAsRule? }`) |
| GET | `/api/invoices/suggest-classification/:supplierId` | Sugestão de classificação |

Todos os endpoints requerem `requireMinRole("manager")`.

## Decisões de design

- **Sem OCR / ML**: classificação é determinística, baseada em regras manuais acumuladas.
- **`costCenterId` fica nas linhas, não no cabeçalho**: uma fatura pode ter linhas distribuídas por vários centros de custo. O filtro por `costCenterId` na listagem usa subquery em `invoice_lines`.
- **Valores em cêntimos**: evita aritmética de vírgula flutuante.
- **Regras de classificação por fornecedor**: modelo simples e auditável; `confidenceBoost` cresce com confirmações manuais (máx 100), score final = `0.5 + (boost/100) * 0.5`.

## SQL — tabelas Supabase

```sql
-- Faturas
create table invoices (
  id                  uuid primary key,
  supplier_id         uuid references suppliers(id) on delete set null,
  supplier_name       text not null,
  invoice_number      text not null,
  invoice_date        date not null,
  due_date            date,
  paid_at             date,
  subtotal_without_vat bigint not null,
  total_vat           bigint not null,
  total_with_vat      bigint not null,
  status              text not null default 'pending',
  notes               text,
  attachment_url      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Linhas de fatura
create table invoice_lines (
  id                    uuid primary key,
  invoice_id            uuid not null references invoices(id) on delete cascade,
  description           text not null,
  type                  text not null default 'other',
  cost_center_id        uuid references cost_centers(id) on delete set null,
  category              text,
  subcategory           text,
  stock_item_id         uuid,
  quantity              numeric not null,
  unit                  text,
  unit_cost_without_vat bigint not null,
  vat_rate              numeric not null,
  vat_amount            bigint not null,
  total_with_vat        bigint not null,
  stock_entry_id        uuid,
  created_at            timestamptz not null default now()
);

-- Regras de classificação automática
create table classification_rules (
  id                      uuid primary key,
  supplier_id             uuid not null unique references suppliers(id) on delete cascade,
  default_cost_center_id  uuid references cost_centers(id) on delete set null,
  default_line_type       text,
  default_category        text,
  confidence_boost        integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index on invoice_lines(invoice_id);
create index on invoice_lines(cost_center_id);
create index on invoices(supplier_id);
create index on invoices(invoice_date desc);
create index on invoices(status);
```

## Como testar

- Domínio/use cases: `npx jest --testPathPattern="src/modules/invoices" --no-coverage`
- Adapters: integração com Supabase (requer env vars `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`).

## Pontos de atenção / dívidas conhecidas

- `stock_item_id` e `stock_entry_id` nas linhas estão preparados para o módulo `stock-valuation` (Sessão 5).
- Sem validação de `invoiceNumber` único por fornecedor — pode ser adicionada como regra de domínio futura.
