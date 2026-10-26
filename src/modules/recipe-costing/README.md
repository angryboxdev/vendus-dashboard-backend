# Módulo: recipe-costing

> Status: ativo
> Última atualização: 2026-10-25

---

## O que é e para que serve (perspetiva do negócio)

Mostra quanto custa fazer cada pizza (custo do prato), por tamanho, a partir das fichas técnicas e do preço atual de cada ingrediente.

**O problema que resolve:**
As fichas técnicas diziam *o quê* e *quanto* leva cada pizza, mas não *quanto custa*. O preço dos ingredientes muda a cada compra e ninguém recalculava o custo à mão.

**O fluxo do ponto de vista do negócio:**

```
Gestão                                   Sistema
──────────────────────                  ──────────────────────
1. Importa/confirma faturas no Stock  →  2. Guarda o custo unitário da compra
                                          3. Custo do prato recalcula-se sozinho
4. Vê ingredientes sem preço (alerta)
5. Preenche à mão (opcional)          →  6. Usa o preço manual até à próxima fatura
```

**Conceitos-chave para o negócio:**

- **Custo do prato** — soma de quantidade × preço de cada ingrediente da ficha técnica ativa, por tamanho, s/ IVA, com a perda (%) da linha.
- **Origem do preço** — «Fatura» (última compra importada com custo) ou «Manual» (custo de referência do artigo). A fatura é a fonte da verdade: passa sempre à frente do manual.
- **Incompleto** — algum ingrediente não tem preço; o custo mostrado é parcial (subavaliado).

---

## Propósito técnico

Leitura e cálculo, sem escrita: `GET /api/recipe-costing` devolve o custo de cada pizza por tamanho, os ingredientes usados (custo + origem) e os que não têm preço. Não guarda custos calculados (recalcula a cada pedido) nem escreve preços — o preço manual grava-se pelo catálogo de stock (`PUT /api/stock/items/:id`).

## Conceitos do domínio

- `RecipeCostingSnapshot` — pratos (PVP + linhas da receita ativa), preparos e custo de cada ingrediente.
- `computeRecipeCosting` (serviço puro) — custo por tamanho; preparo = fator × custo do lote, com o fator igual ao do consumo de stock (`useAsUnit` → unidades; senão `quantidade / yieldQty`); linha × `(1 + wasteFactor)`.
- `DishSizeCost.lines` — custo de cada linha da ficha (artigo direto ou preparo), pela ordem da receita, com a perda aplicada; `complete: false` quando falta o preço de algum ingrediente da linha (num preparo, basta um). A ficha técnica (modal «Ver receita» no frontend) mostra-o por baixo de cada quantidade e o total do prato no rodapé.
- Preço ≤ 0 ou ausente = sem preço: não bloqueia, marca o tamanho `complete: false` e entra em `missingPrices` com os pratos que o usam.

## Portas

### Entrada (casos de uso)

- `GetRecipeCostingPort` — relatório de custo da organização.
- `GetMenuCostingSettingsPort` / `SaveMenuCostingSettingsPort` — taxa de IVA das vendas por empresa para a margem (V7; sem linha = 13%).
- `GetIngredientsCostOverviewPort` — último custo, referência comparativa e série semanal de todos os artigos com compras confirmadas (task V6; `ingredient-overview.service.ts`).
- `GetIngredientUsagePort` — fichas técnicas que usam o artigo, diretamente ou via preparo, com o custo da linha e o peso no prato (`ingredient-usage.service.ts`).
- `GetDishesImpactPort` — custo atual de cada pizza face a há N semanas, com a diferença por ingrediente e o fator principal (`dish-impact.service.ts`).

### Saída (dependências do domínio)

- `RecipeCostingReadPort` — `loadSnapshot(org)`.
- `MenuCostingSettingsRepositoryPort` — `menu_costing_settings` (uma linha por empresa; migração `20261128100000`).
- `PurchaseObservationReadPort` — compras confirmadas de um artigo (`listForItem`) ou de todos (`listAll`, paginado).
- `DishWeeklyCostReadPort` — versões das fichas; `listPizzas` e `listLatestPizzaVersions` para o impacto.

## Adapters

### Entrada

- `RecipeCostingController` → `GET /api/recipe-costing` (permissão `stock.recipes`, READ) e `GET /api/recipe-costing/dishes/:id/weekly?weeks=12` (custo teórico semanal da pizza por tamanho; `stock.recipes`), e `GET /api/recipe-costing/ingredients/:id/price-history?weeks=26` (histórico semanal do preço de compra; permissão `stock.items`, READ — mostrado em «Artigos e ingredientes»). Task V6: `GET /api/recipe-costing/ingredients/overview?weeks=12` e `GET /api/recipe-costing/ingredients/:id/usage` (`stock.items`, READ), `GET /api/recipe-costing/dishes/impact?compareWeeks=4` (1–52; `stock.recipes`, READ).

### Saída

- `SupabaseRecipeCostingReadAdapter` → tabelas legacy `pizzas`, `pizza_prices`, `pizza_recipes` (só a ativa), `pizza_recipe_items`, `preparations`, `preparation_items`, `stock_items` e a RPC `get_stock_quantities_with_last_purchase`.

## Decisões de design

- **Margem e variante XS (task V7, decisão do utilizador 2026-10-26).** Substitui a decisão anterior de não mostrar margem. Por tamanho: `margin = { netSalePrice = PVP ÷ (1 + IVA), marginWithoutVat = netSalePrice − custo, marginRatio, foodCostRatio }`, **só com custo completo e PVP > 0** (nunca sobre custo parcial). IVA das vendas por empresa em `menu_costing_settings` (`GET/PUT /recipe-costing/settings`); sem linha vale 13% (taxa intermédia; a Vendus marca os pratos «INT») — validar com a contabilidade. Uma linha de preparação sem ingredientes deixa o tamanho parcial. Tamanhos `xs → small → large`; XS só nas doces e = metade da Pequena (regra aplicada ao gravar, no frontend). O relatório inclui `preparations` (custo do lote) para a lista de Preparações sem um pedido por preparação.

- **Custos na lista de artigos e impacto nas pizzas (task V6).** «Último custo» = última compra confirmada (nunca o manual: sem compra → «Sem custo conhecido»; o manual aparece à parte como «Custo manual»). **Referência comparativa** = média ponderada das compras confirmadas nas 12 semanas anteriores à última compra (sem compras nesse intervalo → «Histórico insuficiente», sem variação). Impacto = **ficha técnica atual** aplicada aos preços de cada semana (reconstruído, assim rotulado — não é o custo histórico com a versão em vigor, que está no custo semanal V5); só é comparável com as duas semanas completas; a soma das diferenças por linha dá a variação. Sem margem (sem regra de IVA das vendas).

- **Custo teórico semanal da pizza (task V5 §6).** Versões das fichas em `recipe_versions` (migração `20261118100000`), gravadas por **triggers** a cada alteração de `pizza_recipe_items`/`pizza_recipes`/`preparation_items`/`preparations` (rendimento/«usar como unidade»; só o nome não conta) — qualquer caminho de escrita, incluindo o legado. Uma versão por entidade e por transação; a migração grava a versão inicial («a partir de agora»). Cada semana usa a versão em vigor no fim da semana (e a dos preparos); antes da primeira versão: «sem versão histórica» (nunca se fabrica histórico). Preço do ingrediente na semana: média ponderada das compras → último preço transportado → custo manual (assinalado) → sem preço (semana «incompleta», nunca zero). Soma com precisão total, arredondamento só no fim. CMV teórico, não consumo; não mexe no Stock.

- **Histórico semanal do preço de compra (task V5 §5).** Fonte: linhas de compra confirmadas para o Stock (`stock_review_lines` de revisões `applied`) — o mesmo evento que gera os movimentos, com bruto, IVA e desconto da linha; sem tabela nova. Data = data da fatura; semana ISO 8601. Por semana: média **ponderada** pela quantidade (custo total ÷ quantidade total). Semana sem compra: «sem nova compra» e o último preço só como referência transportada (assinalada); sem compras nenhumas: indisponível, nunca zero. Fora: movimentos manuais e o importador antigo do Stock (custos noutra unidade) e notas de crédito (não geram revisão).

- **A fatura manda.** Mesma precedência do catálogo (`stockItemService.effectiveLastPurchaseCosts`): último movimento `purchase` com custo; só sem compra se usa o manual. Um preço manual não apaga nem bloqueia a fatura seguinte — fica guardado mas deixa de contar.
- **Calculado a cada leitura**, sem tabela nem cache: o custo acompanha sozinho cada fatura confirmada, sem jobs nem migração.
- **Custo s/ IVA.** O PVP vem como está em `pizza_prices` (com IVA); a margem converte-o para s/ IVA com a taxa da empresa (ver V7 acima).
- **Perda incluída no custo** (`waste_factor`), ao contrário do consumo de stock, que não a aplica.
- Último preço (não média ponderada), igual ao resto do Stock.

## Como testar

`npx jest src/modules/recipe-costing` (unitários com fake, sem BD).

## Pontos de atenção

- Os itens das receitas e o custo são por organização (sem dimensão de loja).
- **Unidade do custo: euros por unidade base.** `stock_movements.unit_cost_per_base_unit_*` está em euros em todo o Stock; até à migração `20261115100000` a confirmação das Compras por rever copiava o valor da linha em cêntimos (×100). Ver o README de `stock-purchase-review`.
- O custo por fatura só aparece depois de a linha da fatura estar associada ao artigo e confirmada para o stock (movimento `purchase` com custo).
