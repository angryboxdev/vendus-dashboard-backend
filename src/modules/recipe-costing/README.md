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
- Preço ≤ 0 ou ausente = sem preço: não bloqueia, marca o tamanho `complete: false` e entra em `missingPrices` com os pratos que o usam.

## Portas

### Entrada (casos de uso)

- `GetRecipeCostingPort` — relatório de custo da organização.

### Saída (dependências do domínio)

- `RecipeCostingReadPort` — `loadSnapshot(org)`.

## Adapters

### Entrada

- `RecipeCostingController` → `GET /api/recipe-costing` (permissão `stock.recipes`, READ).

### Saída

- `SupabaseRecipeCostingReadAdapter` → tabelas legacy `pizzas`, `pizza_prices`, `pizza_recipes` (só a ativa), `pizza_recipe_items`, `preparations`, `preparation_items`, `stock_items` e a RPC `get_stock_quantities_with_last_purchase`.

## Decisões de design

- **A fatura manda.** Mesma precedência do catálogo (`stockItemService.effectiveLastPurchaseCosts`): último movimento `purchase` com custo; só sem compra se usa o manual. Um preço manual não apaga nem bloqueia a fatura seguinte — fica guardado mas deixa de contar.
- **Calculado a cada leitura**, sem tabela nem cache: o custo acompanha sozinho cada fatura confirmada, sem jobs nem migração.
- **Custo s/ IVA.** O PVP vem como está em `pizza_prices`; não se calcula margem/percentagem por agora, para não misturar bases de IVA (a taxa de IVA da venda não está modelada).
- **Perda incluída no custo** (`waste_factor`), ao contrário do consumo de stock, que não a aplica.
- Último preço (não média ponderada), igual ao resto do Stock.

## Como testar

`npx jest src/modules/recipe-costing` (unitários com fake, sem BD).

## Pontos de atenção

- Os itens das receitas e o custo são por organização (sem dimensão de loja).
- O custo por fatura só aparece depois de a linha da fatura estar associada ao artigo e confirmada para o stock (movimento `purchase` com custo).
