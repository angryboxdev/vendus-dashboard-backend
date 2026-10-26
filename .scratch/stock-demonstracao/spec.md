# Demonstração do Stock — 3 cenários fictícios (Comida brasileira, Hamburgueria, Bar)

Pedido do utilizador (2026-10-26): botão «Demonstração» em **Artigos e ingredientes** para escolher um de três
cenários fictícios com artigos, compras, fichas técnicas, vendas, custos e evolução de custos. **Independente
da demonstração do RH** (que fica igual e não é tocada). **Só Admins.** Dados alteráveis, com «Recomeçar demonstração».

## Fase 0 — auditoria (concluída, só leitura)

### Rotas usadas pela Gestão de Stock
`/api/stock/*` (artigos, categorias, movimentos), `/api/stock-count/*`, `/api/stock-purchase-reviews/*`,
`/api/stock-planning/*`, `/api/pizzas/*`, `/api/preparations/*`, `/api/recipe-costing/*`,
`/api/reports/ingredient-consumption` (Movimentos), `/api/invoices/import-for-stock` (Compras por rever),
`/api/financial-base/suppliers` (nomes de fornecedores no planeamento), `/api/locations`.

### Vendas (risco principal: a chave da Vendus é global → vendas REAIS)
| Leitor | Rota / job | Ecrã | Na demo |
|---|---|---|---|
| `ingredientConsumptionService` | `GET /api/reports/ingredient-consumption` | Movimentos | lê a Vendus em direto → **tem de usar vendas fictícias** |
| `LegacyVendusSalesReadAdapter` | `POST /api/stock-planning/{backfill,run-forecast}` | Reposição e planeamento | grava em `sales_demand_actuals_daily` → **tem de ler as vendas fictícias** |
| `dailyVendusConsumptionJobService` | cron diário | Movimentos | só corre na organização fixa (`UNATTENDED_SCOPE`) → sem risco |
| `recipe-costing` | custos, impacto, histórico | Fichas técnicas, Artigos | não lê vendas (usa compras aplicadas) → sem risco |

Crons que percorrem organizações já excluem `is_demo = true` (`organization-listing.ts`).

### Tabelas a preencher (todas `org_id`)
`locations`, `stock_settings`, `stock_categories`, `stock_items`, `stock_movements`, `stock_entry_rules`,
`suppliers`, `invoices`, `invoice_lines`, `stock_purchase_reviews` (status `applied`) e `stock_review_lines`
(alimentam o histórico de preços), `supplier_purchase_presentations`, `pizzas`, `pizza_prices`, `pizza_recipes`,
`pizza_recipe_items`, `preparations`, `preparation_items` (`recipe_versions` nasce dos triggers),
`menu_costing_settings`, `vendus_product_mapping`, contagens (`stock_count_*`), planeamento
(`sales_demand_actuals_daily`, `forecast_*`, `replenishment_recommendations`, `planning_alerts`,
`supplier_delivery_schedules`).

### Restrições encontradas
- `organizations_demo_of_uq` só permite **uma** demonstração por organização real.
- O RH procura a sua demo com `demo_of = real AND is_demo` + `maybeSingle()` (`demo-organization.ts`) — com mais
  demos isto **falharia**; tem de passar a filtrar pelo tipo.
- O middleware de demonstração só atua em `/api/novo-rh/*`.

## Desenho (Fases 1–4)

### Fase 1 — infraestrutura (migração só aditiva)
**Regra do utilizador (2026-10-26): só o Stock. O RH e qualquer outro módulo não sofrem alteração.**
- **Sem tocar no RH**: `organizations_demo_of_uq`, `demo_of` e a procura da demo do RH ficam como estão. As
  organizações do Stock são `is_demo = false`, `status = 'inactive'`, `demo_of = null` (a regra
  `organizations_demo_consistency_ck` liga `is_demo` a `demo_of`, já usado pelo RH); os crons excluem-nas pela tabela
  de ligação; a ligação
  empresa real → cenário vive numa **tabela nova do módulo**: `stock_demo_organizations (real_org_id, scenario,
  demo_org_id, seed, created_by, created_at)`, único `(real_org_id, scenario)`. Migração só cria esta tabela.
- Novo módulo `stock-demo` (hexagonal): estado/criar/recomeçar por cenário (Admin, Idempotency-Key) e middleware
  `X-Stock-Demo: <cenário>` que troca a organização **só** nas rotas da Gestão de Stock; 403 se não for Admin,
  409 se o cenário não existir.
- **POS fictício** (nome inventado, ex. «CaixaFlow POS», sempre com «fictício»; não usar o nome de software real):
  API simulada dentro do Mezza, chave fictícia visível (`demo-pos-••••`). Na demo, consumo de ingredientes e
  planeamento leem as vendas deste POS; a Vendus e a sua chave nunca são chamadas.
- **Baixas fictícias**: as vendas geram as saídas de stock pelas fichas técnicas (como o job diário da Vendus).
- **Volume**: cada cenário vende 50 000–70 000 € / mês em pratos (quantidades calculadas a partir dos PVP e de um
  padrão semanal).
- Bloqueado na demo: `POST /api/invoices/import-for-stock`.

### Fase 2 — gerador e semente
Gerador puro e determinístico por cenário (mesma semente → mesmos dados), testes com fakes; semente gravada na
organização de demonstração (recusa se não for `is_demo`). Por cenário: ~30–40 artigos, 4–6 fornecedores
fictícios, ~12 semanas de compras aplicadas (com descontos e uma subida de preço), 6–10 preparações, 10–15 pratos
com variantes e PVP, 90 dias de vendas diárias por prato, contagens, mínimos, alguns custos em falta.
«Recomeçar» apaga só dados da organização de demonstração do cenário e volta a semear.

### Fase 3 — frontend
Botão «Demonstração» em Artigos e ingredientes (só Admin): Comida brasileira / Hamburgueria / Bar / Sair /
Recomeçar. O cabeçalho `X-Stock-Demo` só é enviado nas páginas `/stock/*`; faixa fixa «Demonstração: <cenário>».

### Fase 4 — QA e publicação
Capturas dos 3 cenários, validação completa, migração + deploy só com aprovação.
