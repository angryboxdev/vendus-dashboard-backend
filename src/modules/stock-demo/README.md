# Module: stock-demo

> Status: active
> Last updated: 2026-10-26

---

## What it is and what it's for (business perspective)

Demonstração da **Gestão de Stock** com três cenários fictícios — **Comida brasileira**, **Hamburgueria** e
**Bar** — para conhecer e mostrar todas as funcionalidades do Stock (artigos, compras, fichas técnicas, vendas,
custos, evolução de custos, reposição) sem tocar em dados reais.

**The problem it solves:**
Sem dados realistas não se vê o Stock a funcionar de ponta a ponta, e mostrar dados reais expõe a operação da
empresa. As vendas são o ponto crítico: a chave da Vendus é global e numa demonstração traria vendas reais.

**The flow from the business's point of view:**

```
Admin                                   Mezza
──────────────────────                 ──────────────────────
1. Artigos e ingredientes → «Demonstração»
2. Escolhe «Hamburgueria»          →    3. Toda a Gestão de Stock mostra o cenário fictício
                                          (faixa «Demonstração: Hamburgueria · Sair»)
4. «Sair»                          →    5. Volta aos dados reais
```

**Key concepts for the business:**

- **Cenário** — uma empresa fictícia completa (brasileira, hamburgueria ou bar), separada da real.
- **CaixaFlow POS (fictício)** — POS inventado (não é um software real) cuja «API» simulada fornece as vendas do
  cenário: 50 000–70 000 € por mês em pratos, mais ao fim de semana.

---

## Technical purpose

Liga a empresa real a uma organização fictícia por cenário, troca de organização nas rotas da Gestão de Stock
(`X-Stock-Demo`) e fornece as vendas simuladas aos leitores de vendas do Stock. **Não** toca na demonstração do
RH (módulo `demo-data`, ADR-0034) nem em mais nenhum módulo.

## Domain concepts

- `StockDemoLink` — empresa real + cenário → organização fictícia (`is_demo = false`, `demo_of = null`,
  `status = 'inactive'`; excluída dos crons pela tabela de ligação — ADR-0041), semente,
  vendas mensais alvo, nome e pista da chave do POS fictício.
- `simulateDailySales` (puro, determinístico) — receita do dia = alvo mensal × 12 ÷ 365 × peso do dia da semana ×
  ruído ±8%; repartida por produto com um peso fixo (0,5–2,0) e ruído diário ±20%; quantidade = parte ÷ PVP.
  A mesma semente dá sempre as mesmas vendas.
- Produtos do POS = pratos **ativos** com referência em `vendus_product_mapping` e PVP > 0 na organização fictícia.

## Ports

### Input (use cases)

- `GetStockDemoStatusPort` — estado dos 3 cenários (só Admin).
- `ResolveStockDemoPort` — empresa real + cenário → organização fictícia (cache 60 s, para o middleware).
- `DemoPosSalesPort` — vendas do POS fictício por dia (`dailySales`) e procura por prato/variante
  (`dailyDemand`); `null` quando a organização não é uma demo do Stock.

### Output (domain dependencies)

- `StockDemoRepositoryPort` — `stock_demo_organizations` (scoped pela empresa real; a procura pela organização
  fictícia usa `infra/scoped-db/stock-demo-organization.ts`, não-scoped só para esta tabela).
- `PosCatalogReadPort` — pratos mapeados + PVP da organização fictícia.

## Adapters

### Input

- `stock-demo.controller.ts` → `GET /api/stock-demo` (estado; sempre na empresa real) e
  `GET /api/stock-demo/pos/sales?from&to` (a «API» do POS fictício; 404 fora de uma demo).
- `stock-demo-context.middleware.ts` → com `X-Stock-Demo: brasileira|hamburgueria|bar`, troca `req.auth.orgId`
  nas rotas `/api/stock/*`, `/api/stock-count*`, `/api/stock-purchase-reviews*`, `/api/stock-planning*`,
  `/api/pizzas*`, `/api/preparations*`, `/api/recipe-costing*`, `/api/reports/ingredient-consumption`,
  `/api/stock-demo/pos*` e, só GET, `/api/locations*` e `/api/financial-base/suppliers*`. 400 cenário
  desconhecido, 403 não-Admin, 409 cenário por criar, 403 em `/api/invoices/import-for-stock` (faturas reais/IA).
  Montado depois do middleware do RH; fora destas rotas o cabeçalho é ignorado.

### Output

- `SupabaseStockDemoRepository`, `SupabasePosCatalogRead`.

### Ligações a outros módulos (server.ts)

- `stock-planning`: `createStockPlanningModule(…, demoPosSales)` envolve o leitor da Vendus em
  `DemoAwareSalesReadAdapter` (numa demo, backfill e previsão usam o POS fictício).
- Consumo de ingredientes (legado `ingredientConsumptionService`): `setDemoProductsSource` — numa demo usa as
  vendas do POS fictício em vez de `buildMonthlySummary`.

## Design decisions (ADR summary)

- Organizações fictícias próprias do Stock, independentes da demo do RH — ADR-0041.
- O POS fictício calcula as vendas (não as guarda): determinístico, sem tabelas de vendas novas; um prato
  inativado ou com PVP novo muda as vendas futuras da demo, como num POS real.

## How to test

`npx jest --config jest.config.cjs src/modules/stock-demo` (fakes; inclui o adapter do planeamento).
Migração validada em PGlite (aplicar, reaplicar, unicidade, rollback, demo do RH intacta).

## Seeding (Fase 2)

- Cenários em `domain/services/scenarios/` (Comida brasileira, Hamburgueria, Bar): fornecedores inventados, ~30
  artigos, 3–7 preparações, 12–13 pratos (XS nas doces), PVP e IVA das vendas (bar 23%).
- `buildStockDemoPlan` (puro): vendas de 90 dias → consumo pelas fichas → baixas diárias (`consumption`); compras
  semanais por fornecedor (cobrem o consumo + reserva de 1,2× o mínimo, arredondadas à embalagem; tendência
  `up/down/spike`, desconto do fornecedor) → `invoices` + `invoice_lines` + `stock_purchase_reviews` (applied) +
  `stock_review_lines` + entradas (`purchase`); stock inicial; artigos «stock baixo» acabam a metade do mínimo;
  `sales_demand_actuals_daily`; `vendus_product_mapping` (referências do POS fictício); `menu_costing_settings`,
  `stock_settings`. Versões das fichas recuadas ao início do histórico.
- Bebidas vendidas tal como vêm (água, refrigerante, cerveja em garrafa, guaraná) **não são pratos**: são artigos
  vendáveis (`is_sellable`, `sale_price`) ligados ao POS por referência (`target_type = 'stock'`); cada venda dá baixa
  de 1 unidade do artigo e a procura do planeamento é do artigo (`stock`). Só são pratos as bebidas com medida ou
  preparação (imperial/caneca do barril, copo de vinho, taça de espumante, cocktails). Decisão do utilizador
  (2026-10-26).
- Unidades: linha da compra em cêntimos (por unidade base em cêntimos); movimento em euros por unidade base.
- `POST /api/stock-demo/:scenario` (criar; já criado → 200) e `POST /api/stock-demo/:scenario/reset` (recomeçar até
  hoje), só Admin; depois de semear corre a previsão do planeamento. O seeder recusa organizações que não estejam
  em `stock_demo_organizations`.
- Validação: os 3 planos gravados contra todas as migrações em PGlite (sem erros, sem stock negativo).

## Known gaps / open debt

- Contagens físicas fictícias não são geradas.
- Botão e faixa no frontend — Fase 3.
