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
RH (módulo `demo-data`, ADR-0034) nem em mais nenhum módulo; a geração dos dados de cada cenário é a Fase 2.

## Domain concepts

- `StockDemoLink` — empresa real + cenário → organização fictícia (`is_demo = true`, `demo_of = null`), semente,
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

## Known gaps / open debt

- Criar e recomeçar cenários e o gerador de dados — Fase 2.
- Botão e faixa no frontend — Fase 3.
