# Sistema Financeiro Integrado — Plano de Desenvolvimento

> Status: Em progresso — sessões 1A, 1B, 2A, 2B concluídas; próxima: 3A
> Inicio: 2026-06-16
> Ultima atualização: 2026-06-16

---

## Visão geral

Transformar o Angry Box Hub de dashboard operacional em sistema financeiro
inteligente e auditável. O fluxo central é:

```
Venda (Vendus) → ficha técnica → consumo stock → custo médio → CMV
    → margem de contribuição → DRE → banco → fluxo de caixa → conciliação
```

O sistema responde duas perguntas:
1. A Angrybox está **a vender bem**?
2. A Angrybox está **a ganhar dinheiro de verdade**?

---

## Navegação — sidebar (conforme mockups)

```
Dashboard
Vendus Analytics
Mapa de rentabilidade
Fechos de Caixa

── FINANCEIRO ──────────────────
Centros de Custo
Fornecedores
Faturas
Cobrar e Pagar          ← payables + receivables
Conciliação Bancária
DRE Interna
Fluxo de Caixa
────────────────────────────────

Recursos Humanos
CRM
Configurações
```

---

## Princípio de execução

Implementar primeiro as **páginas fonte de dados** e por último as
**páginas de computação** que dependem desses dados.

```
FONTES DE DADOS                       COMPUTAÇÕES
─────────────────────────────────     ─────────────────────────────────────
financial-base (cc + fornecedores)  ─┐
invoices (faturas + classificação)  ─┤
cobrar-e-pagar (payables+receiv.)   ─┼─→ financial-reports
bank-statements (extratos + mov.)   ─┤     (DRE, mapa rentabilidade,
stock-valuation (custo médio + CMV) ─┘      fluxo de caixa, conciliação,
                                             fecho mensal)
```

---

## Módulos

| # | Módulo | Tipo | Páginas | Sessões est. |
|---|--------|------|---------|--------------|
| 1 | `financial-base` | Fonte | Centros de Custo + Fornecedores | 2 (back+front) |
| 2 | `invoices` | Fonte | Faturas (import, OCR, classificação) | 3 (back+front+OCR) |
| 3 | `cobrar-e-pagar` | Fonte | Cobrar e Pagar (payables + receivables) | 2 (back+front) |
| 4 | `bank-statements` | Fonte | Conciliação Bancária (import + reconciliação) | 2 (back+front) |
| 5 | `stock-valuation` | Fonte+estado | Stock entries + custo médio + CMV | 3 (back+front+CMV) |
| 6 | `financial-reports` | Computação | DRE + Mapa Rent. + Fluxo de Caixa + Fecho | 4 sessões |

**Fase 11 (API Millennium):** fora do âmbito inicial — adapter substituto do
importador manual, a implementar no futuro como troca de um output port.

---

## Progresso por módulo

---

### Módulo 1 — `financial-base`
**Status:** ✅ Concluído (sessões 1A + 1B)
**Páginas:** Centros de Custo, Fornecedores

#### O que os mockups mostram

**Centros de Custo (listagem)**
- KPIs topo: Total em aberto · Total por pagar · Total em atraso
- Filtros: Período, Categoria, Estado, Responsável
- Tabela: Nome, Código, Categoria, Responsável, Gasto Mês, Pago, Por pagar,
  Atraso, Ações (ver, editar, ativar/inativar, eliminar, ver faturas, relatório)
- Sidebar direita: gráfico de barras "Resumo por categoria" + lista "Próximos vencimentos"

**Exemplos de centros de custo:** Administração, Operações, Marketing,
Logística, App Delivery, Software, Taxas Bancárias, Recursos Humanos

#### Entidades do domínio

```
CostCenter
  id, code, name, category (CostCenterCategory), subcategory,
  description, responsibleName, status ("active"|"inactive"),
  createdAt, updatedAt

Supplier
  id, name, nif, email, phone, address, iban,
  defaultCostCenterId, defaultCategoryId, paymentTermsDays,
  notes, status ("active"|"inactive"), createdAt, updatedAt

CostCenterCategory (enum)
  "administration" | "operations" | "marketing" | "logistics"
  | "hr" | "technology" | "finance" | "real_estate" | "other"
```

#### Input ports (use cases)
- `CreateCostCenterPort` / `UpdateCostCenterPort` / `ToggleCostCenterStatusPort`
- `ListCostCentersPort` (filtros: categoria, estado, responsável, período)
- `GetCostCenterPort` (com resumo financeiro: total faturas, total pago, por pagar, vencido)
- `CreateSupplierPort` / `UpdateSupplierPort` / `ToggleSupplierStatusPort`
- `ListSuppliersPort` / `GetSupplierPort`

#### Output ports
- `CostCenterRepositoryPort` — save, findById, findAll, update
- `SupplierRepositoryPort` — save, findById, findAll, update

#### Adapters
- **In:** `FinancialBaseController` (REST CRUD centros de custo + fornecedores)
- **Out:** `SupabaseCostCenterRepository`, `SupabaseSupplierRepository`

#### Rotas
```
GET    /financial-base/cost-centers
POST   /financial-base/cost-centers
GET    /financial-base/cost-centers/:id
PATCH  /financial-base/cost-centers/:id
PATCH  /financial-base/cost-centers/:id/status

GET    /financial-base/suppliers
POST   /financial-base/suppliers
GET    /financial-base/suppliers/:id
PATCH  /financial-base/suppliers/:id
PATCH  /financial-base/suppliers/:id/status
```

#### Tabelas Supabase
```sql
cost_centers (id uuid PK, code text UNIQUE, name text, category text,
              subcategory text, description text, responsible_name text,
              status text DEFAULT 'active', created_at timestamptz,
              updated_at timestamptz)

suppliers    (id uuid PK, name text, nif text, email text, phone text,
              address text, iban text, default_cost_center_id uuid FK,
              default_category_id text, payment_terms_days int,
              notes text, status text DEFAULT 'active',
              created_at timestamptz, updated_at timestamptz)
```

#### Sessões
- [x] **Sessão 1A — Backend:** domain → ports → use cases → testes (fakes) → adapters Supabase → controller → module → README
- [x] **Sessão 1B — Frontend:** listagem CC (tabela + KPIs + sidebar resumo) + ficha CC + CRUD fornecedores

---

### Módulo 2 — `invoices`
**Status:** ✅ Concluído (sessões 2A + 2B)
**Depende de:** `financial-base` (lê fornecedores e centros de custo)
**Página:** Faturas

#### O que os mockups mostram

**Faturas (página principal)**
- KPIs: nº faturas / total s/IVA / nº vencidas / nº pendentes
- Área de upload: drag & drop PDF, imagem ou CSV
- Painel **"Leitura automática / OCR"**: extrai Fornecedor, NIF, Total s/IVA,
  Total IVA, Total c/IVA, Data, Vencimento, Nº fatura → "Confirmar leitura" /
  "Editar dados"
- Tabela de faturas: Status, Fornecedor, NIF, Nº, Data Emissão, Vencimento,
  Data Pag, Total s/IVA, IVA, Total, Centro de Custo, Ações
- **Classificação por linha** inline na mesma página: tabela por linha da fatura
  com Qtd, Unid, Total s/IVA, CC, Tipo, Categoria, Sugerido (badge), Ação

#### Nota sobre importação
Sem OCR. O utilizador faz upload do PDF/imagem da fatura como anexo (para
arquivo), e preenche manualmente os campos (fornecedor, NIF, valores, datas).
A classificação por linha é manual, assistida por sugestões baseadas em regras
do histórico do fornecedor.

#### Entidades do domínio

```
Invoice
  id, supplierId, supplierName (denorm), invoiceNumber, invoiceDate,
  dueDate, paidAt, subtotalWithoutVat (cents), totalVat (cents),
  totalWithVat (cents), status (InvoiceStatus), notes, attachmentUrl,
  createdAt, updatedAt

InvoiceLine
  id, invoiceId, description, type (InvoiceLineType), costCenterId,
  category, subcategory, stockItemId, quantity, unit,
  unitCostWithoutVat (cents), vatRate (%), vatAmount (cents),
  totalWithVat (cents), stockEntryId (set when processed), createdAt

InvoiceStatus
  "pending" | "paid" | "overdue" | "partial" | "cancelled" | "review"

InvoiceLineType
  "stock_purchase" | "operational_expense" | "fixed_cost" |
  "variable_cost" | "tax" | "bank_fee" | "salary" |
  "internal_transfer" | "service" | "mixed" | "other"

ClassificationRule
  id, supplierId, defaultCostCenterId, defaultLineType,
  defaultCategory, confidenceBoost, createdAt, updatedAt
```

#### Input ports
- `CreateInvoicePort` (com linhas)
- `UpdateInvoicePort`
- `ClassifyInvoiceLinePort` (tipo + cc + stockItem numa linha)
- `SuggestLineClassificationPort` (regras: fornecedor, histórico, valor → sugestão + score)
- `MarkInvoicePaidPort` (define paidAt + muda status para "paid")
- `ListInvoicesPort` (filtros: fornecedor, status, período, cc, tipo linha)
- `GetInvoicePort` (com linhas)
- `DeleteInvoicePort`

#### Output ports
- `InvoiceRepositoryPort`
- `InvoiceLineRepositoryPort`
- `SupplierRepositoryPort` (leitura — partilha tabela de `financial-base`)
- `CostCenterRepositoryPort` (leitura)
- `ClassificationRuleRepositoryPort`
- `StockEntryGatewayPort` (dispara `stock-valuation` quando linha = `stock_purchase`)
- `FileStoragePort` (guarda o PDF/imagem original — Supabase Storage)

#### Adapters
- **In:** `InvoiceController` (REST CRUD + upload)
- **Out:** `SupabaseInvoiceRepository`, `SupabaseInvoiceLineRepository`,
  `SupabaseClassificationRuleRepository`, `SupabaseFileStorageAdapter`,
  `StockValuationGatewayAdapter`

#### Tabelas Supabase
```sql
invoices (id uuid PK, supplier_id uuid FK, supplier_name text,
          invoice_number text, invoice_date date, due_date date,
          paid_at date, subtotal_without_vat int, total_vat int,
          total_with_vat int, status text, notes text,
          attachment_url text, created_at timestamptz, updated_at timestamptz)

invoice_lines (id uuid PK, invoice_id uuid FK, description text,
               type text, cost_center_id uuid FK, category text,
               subcategory text, stock_item_id uuid, quantity numeric,
               unit text, unit_cost_without_vat int, vat_rate numeric,
               vat_amount int, total_with_vat int, stock_entry_id uuid,
               created_at timestamptz)

classification_rules (id uuid PK, supplier_id uuid FK,
                      default_cost_center_id uuid, default_line_type text,
                      default_category text, confidence_boost int DEFAULT 0,
                      created_at timestamptz, updated_at timestamptz)
```

#### Sessões
- [x] **Sessão 2A — Backend:** domain → ports → use cases → testes → adapters → controller → module → README
- [x] **Sessão 2B — Frontend:** listagem faturas + upload manual + ficha com classificação por linha

---

### Módulo 3 — `cobrar-e-pagar`
**Status:** A fazer
**Depende de:** `invoices` (lê faturas), `financial-base` (cc + fornecedores)
**Página:** Cobrar e Pagar

#### O que os mockups mostram

- KPIs: Total a pagar · Vencido · Vence próx. 7 dias · Pago este mês
- Tabela: ícone de marca do fornecedor, Documento, Centro de Custo, Fornecedor,
  Vencimento, Renovação (recorrência), Valor, Pago, Estado, Ações
- Sidebar direita: **calendário visual** de próximos vencimentos (vista mensal)
- Resumo por status: pie chart (Pago / Pendente / Vencido)
- "Calendário de pagamentos" (grid mensal com valores por dia)
- Botão "Novo pagamento" (registo manual de pagamento sem fatura)

#### Nota de design
"Cobrar e Pagar" inclui tanto **contas a pagar** (faturas de fornecedores,
despesas recorrentes) como potencialmente **contas a receber** (repasses de
apps, TPA). Na fase inicial foca em contas a pagar. Contas a receber vêm
integradas no fluxo de caixa.

#### Entidades do domínio

```
PayableEntry
  id, invoiceId (FK, opcional — pagamentos sem fatura têm null),
  supplierId, supplierName (denorm), description, costCenterId,
  category, amount (cents), dueDate, paidAt, recurrence
  (RecurrenceType), status (PayableStatus), notes, createdAt, updatedAt

RecurrenceType: "none" | "monthly" | "quarterly" | "annual"
PayableStatus:  "pending" | "paid" | "overdue" | "cancelled"
```

#### Input ports
- `CreatePayableEntryPort` (manual, sem fatura)
- `ListPayableEntriesPort` (filtros: período, cc, fornecedor, banco, estado)
- `GetPayableEntriesCalendarPort` (agrupa por dia para vista de calendário)
- `MarkPayableAsPaidPort`
- `GetPayableSummaryPort` (KPIs: total a pagar, vencido, próx. 7 dias, pago mês)

#### Output ports
- `PayableEntryRepositoryPort`
- `InvoiceReadPort` (lê faturas pendentes de `invoices`)
- `CostCenterRepositoryPort` (leitura)

#### Tabelas Supabase
```sql
payable_entries (id uuid PK, invoice_id uuid FK nullable,
                 supplier_id uuid FK nullable, supplier_name text,
                 description text, cost_center_id uuid FK,
                 category text, amount int, due_date date, paid_at date,
                 recurrence text DEFAULT 'none', status text,
                 notes text, created_at timestamptz, updated_at timestamptz)
```

#### Sessões
- [ ] **Sessão 3A — Backend:** domain → ports → use cases → testes → adapters → controller → module → README
- [ ] **Sessão 3B — Frontend:** listagem + calendário + KPIs + marcar pago

---

### Módulo 4 — `bank-statements`
**Status:** A fazer
**Depende de:** `financial-base` (cc), `invoices` (para sugestões de conciliação)
**Página:** Conciliação Bancária

#### O que os mockups mostram

- KPIs: Não identificados (nº) · Conciliados (nº + %) · Divergências (nº + %) · Total não conciliado (€)
- Filtros: Período, Banco, Conta, Importar extrato, Nova justificativa
- Tabela movimentos: Banco #, Descrição, Entrada, Saída, Sugerido (badge), Status, Ações
- **Sidebar direita dinâmica**: para o movimento selecionado mostra:
  - Sugestão de conciliação: nome do documento sugerido + valor + botão confirmar/recusar
  - Se não há sugestão: formulário manual para associar a fatura/origem
- Secção "Pendências do mês":
  - Repasses em falta (apps)
  - Faturas sem pagamento bancário confirmado
  - Saídas sem justificativa
  - Saídas sem fatura
- **Barra de progresso**: percentagem de conciliação do mês (ex: 75.3%)

#### Lógica de sugestão de conciliação (regras, não ML)
Quando um movimento bancário é carregado, o sistema tenta associá-lo
automaticamente usando:
1. Valor exato ↔ fatura ou payable com o mesmo valor e data próxima
2. Descrição ↔ nome do fornecedor ou referência bancária
3. Valor ↔ soma de repasses esperados de apps (Uber, Bolt, Glovo) no período
4. Se confiança < limiar → fica "sugerido" para validação manual

#### Entidades do domínio

```
BankStatement
  id, bankName, accountName, iban, periodStart, periodEnd,
  initialBalance (cents), finalBalance (cents), importedAt,
  importedBy, sourceFileUrl, movementCount, createdAt

BankMovement
  id, statementId, date, originalDescription, normalizedDescription,
  entryAmount (cents), exitAmount (cents), balance (cents|null),
  bankRef, entity, iban, reconciliationStatus (ReconciliationStatus),
  reconciledWithId, reconciledWithType ("invoice"|"payable"|"cash_closing"|"manual"),
  costCenterId, category, justification, notes, createdAt, updatedAt

ReconciliationStatus: "unreconciled" | "reconciled" | "partial" | "ignored"
```

#### Input ports
- `ImportBankStatementPort` (parse CSV/XLS/XLSX → statement + movements; previne duplicados)
- `ListBankStatementsPort`
- `GetBankStatementPort` (com movements)
- `ListBankMovementsPort` (filtros: status, período, banco, conta)
- `SuggestMovementReconciliationPort` (devolve sugestão + score para um movement)
- `ReconcileMovementPort` (confirma link movement ↔ invoice/payable/etc)
- `ClassifyMovementPort` (cc + categoria)
- `AddMovementJustificationPort` (para saídas sem fatura)
- `IgnoreMovementPort`
- `GetReconciliationSummaryPort` (pendências do mês + percentagem)

#### Output ports
- `BankStatementRepositoryPort`
- `BankMovementRepositoryPort`
- `FileParserGatewayPort` (CSV/XLS/XLSX → lista BankMovementRaw)
- `InvoiceReadPort` (para sugestões de conciliação)
- `PayableReadPort` (para sugestões de conciliação)
- `CashClosingReadPort` (para conciliar com fechos de caixa)

#### Tabelas Supabase
```sql
bank_statements (id uuid PK, bank_name text, account_name text,
                 iban text, period_start date, period_end date,
                 initial_balance int, final_balance int,
                 imported_at timestamptz, imported_by text,
                 source_file_url text, movement_count int,
                 created_at timestamptz)

bank_movements  (id uuid PK, statement_id uuid FK, date date,
                 original_description text, normalized_description text,
                 entry_amount int DEFAULT 0, exit_amount int DEFAULT 0,
                 balance int, bank_ref text, entity text, iban text,
                 reconciliation_status text DEFAULT 'unreconciled',
                 reconciled_with_id uuid, reconciled_with_type text,
                 cost_center_id uuid FK, category text,
                 justification text, notes text,
                 created_at timestamptz, updated_at timestamptz)
```

#### Sessões
- [ ] **Sessão 4A — Backend:** domain → ports → use cases → parser adapter (xlsx) → controller → module → README
- [ ] **Sessão 4B — Frontend:** upload extrato + listagem movimentos + painel conciliação + pendências

---

### Módulo 5 — `stock-valuation`
**Status:** A fazer
**Depende de:** `invoices` (entradas de stock), módulos legados (fichas-técnicas, stock, vendas)

#### O que os mockups mostram (implícito — sem página própria nos anexos)
O CMV e o custo médio alimentam o Mapa de Rentabilidade e a DRE. A UI de
stock entries será acessível via ficha do produto de stock e via ficha de fatura.

#### Entidades do domínio

```
StockEntry
  id, invoiceId, invoiceLineId, stockItemId, stockItemName,
  quantity, unit, unitCostWithoutVat (cents), totalCostWithoutVat (cents),
  previousAverageCost (cents), newAverageCost (cents),
  previousStock, newStock, entryDate, createdAt

StockAverageCost
  stockItemId (PK), currentAverageCost (cents), currentStock,
  lastUpdatedAt

FinancialCMVMovement
  id, saleId, vendusDocumentId, productName, recipeId,
  stockItemId, stockItemName, quantityConsumed, unit,
  averageCostPerUnit (cents), totalCost (cents),
  salesChannel, saleDate, createdAt
```

#### Input ports
- `RecordStockEntryPort` (a partir de linha de fatura; atualiza custo médio ponderado s/IVA)
- `GetStockAverageCostPort`
- `ListStockEntriesPort` (filtros: item, fornecedor, período)
- `RecordSaleCMVPort` (venda Vendus + ficha técnica → CMV por ingrediente)
- `ListCMVMovementsPort` (filtros: produto, canal, período)

#### Output ports
- `StockEntryRepositoryPort`
- `StockAverageCostRepositoryPort`
- `FinancialCMVRepositoryPort`
- `RecipeCardGatewayPort` (lê fichas técnicas do módulo legado)
- `SalesGatewayPort` (lê vendas do Vendus/módulo legado)
- `StockItemGatewayPort` (lê itens de stock do módulo legado)

#### Tabelas Supabase
```sql
stock_entries (id uuid PK, invoice_id uuid FK, invoice_line_id uuid FK,
               stock_item_id uuid, stock_item_name text,
               quantity numeric, unit text,
               unit_cost_without_vat int, total_cost_without_vat int,
               previous_average_cost int, new_average_cost int,
               previous_stock numeric, new_stock numeric,
               entry_date date, created_at timestamptz)

stock_average_costs (stock_item_id uuid PK, current_average_cost int,
                     current_stock numeric, last_updated_at timestamptz)

financial_cmv_movements (id uuid PK, sale_id text, vendus_document_id text,
                          product_name text, recipe_id uuid,
                          stock_item_id uuid, stock_item_name text,
                          quantity_consumed numeric, unit text,
                          average_cost_per_unit int, total_cost int,
                          sales_channel text, sale_date date,
                          created_at timestamptz)
```

#### Sessões
- [ ] **Sessão 5A — Backend:** domain → ports → use cases → testes → adapters legados → controller → module → README
- [ ] **Sessão 5B — Frontend:** entradas de stock (via ficha fatura) + histórico custo médio
- [ ] **Sessão 5C — CMV automático:** trigger por venda Vendus → ficha técnica → CMV

---

### Módulo 6 — `financial-reports`
**Status:** A fazer
**Depende de:** todos os módulos acima + módulos legados (custos fixos, variáveis)
**Páginas:** DRE Interna, Mapa de Rentabilidade, Fluxo de Caixa, (Fecho Mensal)

#### O que os mockups mostram

**DRE Interna**
- KPIs topo: Receita Líquida · Margem de Contribuição (€ + %) · EBITDA (€ + %) · Resultado Líquido (€ + %)
- Filtros: Período, Canal, Centro de Custo, Comparar com (Mês anterior / período custom)
- Tabela DRE Gerencial:
  ```
  Receita bruta
    (-) IVA
  = Receita líquida gerencial
    (-) CMV ingredientes
    (-) CMV embalagens
    (-) CMV ingredientes gerencial
  = Margem de contribuição        (€ | % | vs anterior)
    (-) Custos fixos / despesas
  = EBITDA gerencial              (€ | % | vs anterior)
    (-) Impostos / ajustes
  = Resultado líquido gerencial   (€ | % | vs anterior)
  ```
- Sidebar: donut "Composição da margem" (Ingredientes, Embalagens, Apps, TPA, Descontos, Margem)
- Gráfico de barras "Comparativo mensal"
- Tabs: análise por Produto / Canal / Loja

**Fluxo de Caixa**
- KPIs: Caixa disponível · Previsto próx. 7 dias · Recebimentos · Pagamentos próximos
- Gráfico principal: Realizado vs Projetado (3 linhas: caixa real, entradas proj., saídas proj.)
- Secções "Contas a receber" e "Contas a pagar" lado a lado
- Tabela movimentos previstos: Data, Tipo, Descrição, CC, Entidade, Origem, Valor, Estado
- Sidebar: "Próximos eventos de caixa" (lista cronológica)

#### Módulo sem persistência própria
Este módulo não tem tabelas. Agrega dados de todos os outros módulos e devolve
relatórios calculados. Os serviços de domínio fazem as computações; os output
ports leem das tabelas dos outros módulos.

#### Input ports
- `GetProfitabilityMapPort` (receita líq. - CMV - taxas por canal = margem; filtros: período, produto, canal)
- `GetInternalDREPort` (estrutura completa receita → EBITDA → resultado; filtros: período, cc, canal)
- `GetCashFlowPort` (realizado + projetado; agrupa fontes: extratos, faturas, fechos)
- `GetReconciliationSummaryPort` (pendências + percentagem conciliação do mês)
- `GetMonthlyCloseStatusPort` (checklist: faturas pendentes, mov. bancários não id., saídas sem justif.)

#### Output ports (leitura — sem persistência própria)
- `InvoiceReadPort`
- `PayableReadPort`
- `BankMovementReadPort`
- `FinancialCMVReadPort`
- `SalesReadPort` (módulo legado)
- `CashClosingReadPort` (módulo cash-closings)
- `FixedCostsReadPort` (módulo legado)
- `VariableCostsReadPort` (módulo legado)
- `CostCenterReadPort`

#### Sessões
- [ ] **Sessão 6A — Backend:** DRE + Mapa de Rentabilidade (domain services + ports + use cases)
- [ ] **Sessão 6B — Frontend:** DRE Interna + Mapa de Rentabilidade
- [ ] **Sessão 6C — Backend:** Fluxo de Caixa + Fecho Mensal
- [ ] **Sessão 6D — Frontend:** Fluxo de Caixa + Fecho Mensal

---

## Decisões de arquitetura transversais

1. **Todos os valores monetários em centavos (inteiros)** — sem floats em
   nenhuma entidade do domínio. `toCents` / `fromCents` nas bordas (já em uso no projecto).

2. **Todos os timestamps em UTC no domínio, com Luxon (Europe/Lisbon) na
   apresentação** — padrão já em uso.

3. **Cross-module reads via output ports** — `financial-reports` nunca importa
   diretamente os repositórios de `invoices`. Declara um `InvoiceReadPort`
   (interface) implementado por um adapter concreto. Mantém independência e
   permite trocar a fonte no futuro.

4. **Classificação automática = sugestão baseada em regras, não imposição** — o
   use case `SuggestLineClassificationPort` devolve uma sugestão com base no
   histórico do fornecedor (fornecedor X → CC Y, tipo Z). Sem ML.
   Se não houver histórico suficiente, a linha fica sem sugestão para preenchimento manual.

5. **Sugestão de conciliação bancária = regras determinísticas** — matching por
   valor exato + data próxima + nome fornecedor/referência bancária. Sem ML.

6. **Sem OCR** — o upload de fatura é apenas para arquivo do ficheiro original.
   Todos os campos são preenchidos manualmente pelo utilizador.

7. **Estética consistente com `cash-closings`** — mesmo padrão de controller,
   DTOs, erros domain-typed e structure de module.ts.

---

## Decisões tomadas

| # | Decisão |
|---|---------|
| D1 | Sem OCR — upload só para arquivo, preenchimento manual |
| D2 | "Cobrar e Pagar" = só contas a pagar (energia, fornecedores) |
| D3 | Sugestão de conciliação = regras determinísticas (valor + data + nome), sem ML |

---

## Dependências entre módulos

```
financial-base
      ↑
   invoices ─────────────────────────────┐
      ↑                                  │
cobrar-e-pagar ───────────────────────── ┤
      ↑                                  │
bank-statements ──────────────────────── ┤
      ↑                                  │
stock-valuation ──────────────────────── ┤
  (+ fichas técnicas, stock, vendas      │
   dos módulos legados)                  │
      ↑                                  │
financial-reports ←──────────────────────┘
  (lê de tudo, não persiste nada)
```

---

## Tabelas Supabase — resumo geral

| Tabela | Módulo | Sessão |
|--------|--------|--------|
| `cost_centers` | financial-base | 1A |
| `suppliers` | financial-base | 1A |
| `invoices` | invoices | 2A |
| `invoice_lines` | invoices | 2A |
| `classification_rules` | invoices | 2A |
| `payable_entries` | cobrar-e-pagar | 3A |
| `bank_statements` | bank-statements | 4A |
| `bank_movements` | bank-statements | 4A |
| `stock_entries` | stock-valuation | 5A |
| `stock_average_costs` | stock-valuation | 5A |
| `financial_cmv_movements` | stock-valuation | 5A |

---

## Registo de sessões

| Sessão | Data | Módulo | Entregável | Status |
|--------|------|--------|-----------|--------|
| 1A | 2026-06-16 | financial-base | Backend: CostCenter + Supplier | Concluído |
| 1B | 2026-06-16 | financial-base | Frontend: listagem CC + fornecedores + fichas | Concluído |
| 2A | 2026-06-16 | invoices | Backend: Invoice + InvoiceLine | Concluído |
| 2B | 2026-06-16 | invoices | Frontend: listagem + ficha + classificação por linha | Concluído |
| 3A | — | cobrar-e-pagar | Backend: PayableEntry | A fazer |
| 3B | — | cobrar-e-pagar | Frontend: listagem + calendário | A fazer |
| 4A | — | bank-statements | Backend: import CSV/XLS + movements + conciliação | A fazer |
| 4B | — | bank-statements | Frontend: upload + movimentos + painel conciliação | A fazer |
| 5A | — | stock-valuation | Backend: stock entries + custo médio | A fazer |
| 5B | — | stock-valuation | Frontend: entradas + histórico custo médio | A fazer |
| 5C | — | stock-valuation | CMV automático por venda | A fazer |
| 6A | — | financial-reports | Backend: DRE + Mapa Rentabilidade | A fazer |
| 6B | — | financial-reports | Frontend: DRE + Mapa Rentabilidade | A fazer |
| 6C | — | financial-reports | Backend: Fluxo de Caixa + Fecho Mensal | A fazer |
| 6D | — | financial-reports | Frontend: Fluxo de Caixa + Fecho Mensal | A fazer |

---

## Próximos passos imediatos (Sessão 3A)

Implementar `cobrar-e-pagar` backend seguindo a ordem do CLAUDE.md:
`domain/entities/` → `domain/ports/` → `application/use-cases/` →
`__tests__/` → `adapters/out/` → `adapters/in/` → `cobrar-e-pagar.module.ts` → `README.md`

Ver especificação completa na secção "Módulo 3 — cobrar-e-pagar" acima.
