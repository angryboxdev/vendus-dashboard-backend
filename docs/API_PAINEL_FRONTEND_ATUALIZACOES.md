# API Painel – Atualizações (versão para o frontend)

Documento complementar ao guia que já receberam. Lista apenas **o que mudou** no endpoint `GET /api/reports/ingredient-consumption`.

---

## 1. Consumo passa a incluir bebidas e outros itens

**Antes:** O array `consumption` tinha só ingredientes usados nas **pizzas** (via receitas).

**Agora:** O array `consumption` inclui:

- **Pizzas** – continuam calculadas pela receita × quantidade vendida (ingredientes em gramas/unidade).
- **Bebidas e outros** – itens mapeados como stock (Coca Cola, águas, etc.); a quantidade é a **quantidade vendida** em unidades.

Ou seja, a mesma tabela de consumo pode mostrar farinha, queijos, Coca Cola, águas, etc. O endpoint e a query (`since`, `until`) não mudaram.

---

## 2. Novos campos em cada item de `consumption`

Cada objeto em `consumption` passa a ter **três campos novos** (para filtrar/agrupar na UI):

| Campo           | Tipo   | Descrição                                                                                            |
| --------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| `type`          | string | Tipo do item em stock: `"ingredient"` \| `"beverage"` \| `"packaging"` \| `"cleaning"` \| `"other"`. |
| `category_id`   | string | UUID da categoria (tabela stock_categories).                                                         |
| `category_name` | string | Nome da categoria (ex.: "Ingredientes", "Bebidas").                                                  |

**Exemplo** de um item que era:

```json
{
  "stock_item_id": "...",
  "name": "Farinha Caputo Saccorosso",
  "base_unit": "g",
  "quantity_consumed": 12500
}
```

**Agora** vem:

```json
{
  "stock_item_id": "...",
  "name": "Farinha Caputo Saccorosso",
  "base_unit": "g",
  "type": "ingredient",
  "category_id": "uuid-da-categoria",
  "category_name": "Ingredientes",
  "quantity_consumed": 12500
}
```

**Sugestão no frontend:** Atualizar os tipos/interfaces para incluir `type`, `category_id` e `category_name`. Podem usar `type` e `category_name` para filtros ou agrupamento (ex.: separar ingredientes de bebidas, ou agrupar por categoria).

---

## 3. Novos campos no `debug`

O objeto `debug` passa a ter **dois campos novos**:

| Campo                | Tipo   | Descrição                                                                                  |
| -------------------- | ------ | ------------------------------------------------------------------------------------------ |
| `products_unmatched` | number | Número de produtos Vendus do período que **não** têm mapeamento (não entraram no consumo). |
| `unmatched_products` | array  | Lista desses produtos, para saber o que falta mapear.                                      |

Cada elemento de `unmatched_products` tem:

- `title` (string) – título no Vendus
- `reference` (string) – referência no Vendus
- `category` (string) – categoria Vendus (ex.: `"pizza"`, `"bebida_nao_alcoolica"`, `"outros"`)
- `qty` (number) – quantidade vendida no período

**Exemplo** de `debug` atualizado:

```json
"debug": {
  "products_total": 45,
  "products_matched": 42,
  "products_unmatched": 3,
  "unmatched_products": [
    { "title": "Produto sem mapeamento", "reference": "REF-123", "category": "outros", "qty": 2 }
  ],
  "took_ms": 1200
}
```

**Sugestão no frontend:** Opcionalmente mostrar uma secção “Itens sem mapeamento” (ex.: colapsável ou tooltip) com `unmatched_products`, para o utilizador ver o que ainda não está no mapeamento.

---

## 4. `opening_stock` – saldo no início do primeiro dia do período

Novo array **`opening_stock`** ao mesmo nível que `consumption` e `additions`.

| Campo                      | Tipo   | Descrição                                                                                                                                         |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stock_item_id`            | string | UUID do item                                                                                                                                      |
| `name`                     | string | Nome                                                                                                                                              |
| `base_unit`                | string | Unidade base                                                                                                                                      |
| `type`                     | string | Como em `consumption`                                                                                                                             |
| `category_id`              | string | UUID categoria                                                                                                                                    |
| `category_name`            | string | Nome da categoria                                                                                                                                 |
| `quantity_at_period_start` | number | Saldo **antes** do primeiro dia civil `since` em **Lisboa**: soma de movimentações com `movement_date` **&lt;** meia-noite de `since` em `Europe/Lisbon` (convertido para UTC na BD). |

**Âmbito:** Só entram itens que também aparecem em **`consumption`** ou **`additions`** nesse pedido. Se não houver consumo nem adições no período, `opening_stock` vem `[]`.

**Nota timezone:** `since` e `until` são dias civis em **`Europe/Lisbon`**. O intervalo de **`additions`** é `[início do dia since, fim do dia until]` em Lisboa; **`opening_stock`** usa o instante imediatamente antes do início desse primeiro dia. O campo `period.timezone` na resposta é `Europe/Lisbon`.

**Exemplo:**

```json
"opening_stock": [
  {
    "stock_item_id": "...",
    "name": "Farinha Caputo Saccorosso",
    "base_unit": "g",
    "type": "ingredient",
    "category_id": "...",
    "category_name": "Ingredientes",
    "quantity_at_period_start": 48000
  }
]
```

---

## Resumo para implementar

1. **Tipos:** Adicionar `type`, `category_id` e `category_name` ao tipo de cada entrada de `consumption`.
2. **Tipos (debug):** Adicionar `products_unmatched` (number) e `unmatched_products` (array de `{ title, reference, category, qty }`) ao tipo de `debug`.
3. **Tipos:** Adicionar array `opening_stock` com entradas `{ stock_item_id, name, base_unit, type, category_id, category_name, quantity_at_period_start }`.
4. **UI (opcional):** Usar `type` e `category_name` para filtros ou agrupamento na tabela de consumo.
5. **UI (opcional):** Mostrar `unmatched_products` numa área de debug/ajuda.
6. **UI (opcional):** Coluna ou cartão com saldo inicial (`opening_stock`) por item alinhado ao consumo/adições.

O endpoint, URL e parâmetros de query **não mudaram**; apenas a forma do JSON de resposta foi alargada.
