# API Painel – Guia para o Frontend

Base URL: **`/api`** (ex.: `GET http://localhost:3000/api/reports/ingredient-consumption`).

Respostas de erro: `{ "error": "string" }`. Código típico: `500` (erro interno).

---

## 1. Consumo de ingredientes

Mostra **quais itens de stock e quanto** foram consumidos num período: pizzas (via receitas) e bebidas/outros (via mapeamento Vendus → stock). Inclui tipo e categoria de cada item.

### Endpoint

**GET** `/api/reports/ingredient-consumption`

### Query (opcional)

| Parâmetro | Tipo   | Descrição |
|-----------|--------|-----------|
| `since`   | string | Início do período, inclusivo. Formato **YYYY-MM-DD**. |
| `until`   | string | Fim do período, inclusivo. Formato **YYYY-MM-DD**. |

- Se **não** enviares `since` nem `until`, o backend usa **ontem** (um único dia).
- Podes enviar sempre o intervalo no frontend (ex.: seletor de datas) e usar "ontem" como valor inicial.

**Exemplos:**

- Ontem (default): `GET /api/reports/ingredient-consumption`
- Período específico: `GET /api/reports/ingredient-consumption?since=2026-02-01&until=2026-02-05`

### Resposta 200

```ts
interface StockAdditionEntry {
  stock_item_id: string;
  name: string;
  base_unit: string;
  type: StockItemType;
  category_id: string;
  category_name: string;
  quantity_added: number;   // soma das entradas (quantity > 0) em stock_movements no período
}

interface IngredientConsumptionResponse {
  period: {
    since: string;   // "YYYY-MM-DD"
    until: string;   // "YYYY-MM-DD"
    timezone?: string;  // ex. "Europe/Lisbon"
  };
  consumption: IngredientConsumptionEntry[];
  additions: StockAdditionEntry[];   // adições de stock no período (compras, ajustes positivos, etc.)
  matched_products?: MatchedProductEntry[];
  debug?: {
    products_total: number;
    products_matched: number;
    products_unmatched: number;
    unmatched_products: UnmatchedProductEntry[];
    took_ms: number;
  };
}

interface IngredientConsumptionEntry {
  stock_item_id: string;
  name: string;
  base_unit: string;      // ex. "g", "cl"
  type: StockItemType;    // "ingredient" | "beverage" | "packaging" | "cleaning" | "other"
  category_id: string;
  category_name: string;  // nome da categoria em stock_categories
  quantity_consumed: number;
}

interface MatchedProductEntry {
  title: string;
  reference: string;
  category: string;   // Vendus: pizza | bebida_alcoolica | bebida_nao_alcoolica | sacos | outros
  qty_sold: number;
  match_type: "pizza" | "stock";
  pizza_id?: string;  // quando match_type === "pizza"
  size?: "small" | "large";
  stock_item_id?: string;   // quando match_type === "stock"
  stock_item_name?: string;
}

interface UnmatchedProductEntry {
  title: string;   // título no Vendus
  reference: string;
  category: string;  // categoria Vendus (pizza, bebida_alcoolica, etc.)
  qty: number;
}
```

- **`consumption`**: todos os itens de stock com `quantity_consumed > 0` (pizzas via receitas + bebidas/outros via mapeamento), ordenados por quantidade (maior primeiro). Inclui `type` e `category_name` para filtrar/agrupar na UI.
- **`additions`**: adições de stock no mesmo período (movimentos com quantidade positiva em `stock_movements`: compras, ajustes, etc.), agregados por item. Mesma estrutura que `consumption` mas com `quantity_added`. Ordenado por quantidade (maior primeiro). Permite comparar “o que saiu” (consumption) com “o que entrou” (additions) no período.
- **`matched_products`**: todos os produtos Vendus que deram match (pizzas, bebidas, sacos, outros). Cada entrada tem `match_type` ("pizza" ou "stock"), `category` (categoria Vendus) e, consoante o tipo, `pizza_id`+`size` ou `stock_item_id`+`stock_item_name`.
- **`debug.unmatched_products`**: produtos Vendus **sem match** no mapeamento (não entraram no consumo). Útil para ver o que falta mapear.
- **`debug`**: `products_total` = total de produtos no período; `products_matched` = quantos tiveram match (pizza ou stock); `products_unmatched` = quantos não tiveram match; `took_ms` = tempo em ms.

### Exemplo de resposta (encurtado)

```json
{
  "period": {
    "since": "2026-02-05",
    "until": "2026-02-05",
    "timezone": "Europe/Lisbon"
  },
  "consumption": [
    { "stock_item_id": "uuid-1", "name": "Farinha Caputo Saccorosso", "base_unit": "g", "type": "ingredient", "category_id": "uuid-cat1", "category_name": "Ingredientes", "quantity_consumed": 12500 },
    { "stock_item_id": "uuid-2", "name": "Coca Cola Zero 33cl", "base_unit": "cl", "type": "beverage", "category_id": "uuid-cat2", "category_name": "Bebidas", "quantity_consumed": 330 }
  ],
  "additions": [
    { "stock_item_id": "uuid-1", "name": "Farinha Caputo Saccorosso", "base_unit": "g", "type": "ingredient", "category_id": "uuid-cat1", "category_name": "Ingredientes", "quantity_added": 50000 },
    { "stock_item_id": "uuid-2", "name": "Coca Cola Zero 33cl", "base_unit": "cl", "type": "beverage", "category_id": "uuid-cat2", "category_name": "Bebidas", "quantity_added": 1200 }
  ],
  "matched_products": [
    { "title": "Honey Peperoni (Grande)", "reference": "VHON15-2508128", "category": "pizza", "qty_sold": 10, "match_type": "pizza", "pizza_id": "uuid-p", "size": "large" },
    { "title": "Coca Cola Zero 33cl", "reference": "VCOC37-25081719", "category": "bebida_nao_alcoolica", "qty_sold": 25, "match_type": "stock", "stock_item_id": "uuid-s", "stock_item_name": "Coca Cola Zero 33cl" }
  ],
  "debug": {
    "products_total": 45,
    "products_matched": 42,
    "products_unmatched": 3,
    "unmatched_products": [
      { "title": "Produto X", "reference": "REF-X", "category": "outros", "qty": 2 }
    ],
    "took_ms": 1200
  }
}
```

### Fluxo sugerido no frontend

1. **Estado inicial**: definir `since` e `until` como “ontem” (ou deixar vazios para o backend usar ontem).
2. **UI**: seletor de intervalo (date picker ou dois inputs `since` / `until`).
3. **Request**: `GET /api/reports/ingredient-consumption?since=YYYY-MM-DD&until=YYYY-MM-DD` (ou sem query se for “ontem”).
4. **Render**: tabelas com `consumption[]` (saídas/consumo) e `additions[]` (entradas no stock no período); opcionalmente secção de debug com `unmatched_products`.

### Notas

- O consumo inclui **pizzas** (via receita × quantidade vendida) e **bebidas/outros** (via mapeamento Vendus → stock; quantidade = unidades vendidas).
- Cada entrada em `consumption` tem **`type`** (ingredient, beverage, packaging, etc.) e **`category_name`** para filtrar ou agrupar na UI.
- **`debug.unmatched_products`** lista os produtos Vendus que não têm mapeamento; usar para identificar o que falta configurar.
- As quantidades estão na **base_unit** do item (ex.: g para farinha, cl para bebidas).

---

## Resumo

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/api/reports/ingredient-consumption` | Consumo de ingredientes no período (query: `since`, `until`; default: ontem) |
