# Formato do documento: Mapeamento Vendus → Pizzas + Stock (Supabase)

Usa este formato para preencheres o relacionamento entre os produtos do Vendus e os dados no Supabase (pizzas e, opcionalmente, itens de stock para bebidas, sacos, etc.). Com isto criamos a tabela de mapeamento e o seed.

O ficheiro `vendus_pizza_mapping.json` tem a estrutura `{ "_comment": "...", "mappings": [ ... ] }`. Cada entrada em `mappings` é **pizza** (mapeia para `pizzas` + size) ou **stock** (mapeia para `stock_items` por nome).

---

## Dados do Vendus (o que temos em cada venda)

Cada linha de documento/fatura no Vendus tem itens com:

| Campo        | Tipo   | Exemplo                    | Notas |
|-------------|--------|----------------------------|--------|
| `reference` | string | `"PIZZA-HP-G"` ou `""`     | Código/referência do produto no Vendus (pode vir vazio). |
| `title`     | string | `"Honey Peperoni (Grande)"` | Nome que aparece na fatura. |
| `category`  | string | `"pizza"`                  | Já vem categorizado (pizza, bebida_alcoolica, etc.). |

No resumo mensal, os produtos são agrupados por **chave = `reference` ou `title`** (quando `reference` está vazio). Por isso o mapeamento pode ser feito por **reference** ou por **title** — o que for estável no teu Vendus.

---

## Dados no Supabase (para onde mapeamos)

| Campo        | Tipo   | Exemplo           | Notas |
|-------------|--------|-------------------|--------|
| Nome da pizza | string | `"Honey Peperoni"` | Valor exato de `pizzas.name` (como está no seed). |
| Tamanho      | string | `"small"` ou `"large"` | `small` = Individual, `large` = Grande. |

Não precisas de UUIDs: basta o **nome da pizza** igual ao que está na tabela `pizzas`; nós resolvemos o `pizza_id` ao carregar o mapeamento.

---

## Formato do ficheiro (JSON)

O ficheiro tem a forma `{ "_comment": "...", "mappings": [ ... ] }`. Cada entrada em `mappings` tem:

- **`match_by`**: `"reference"` ou `"title"` (campo Vendus usado para identificar o produto).
- **`match_value`**: valor exato desse campo.
- **`type`**: `"pizza"` ou `"stock"`.

### Entradas tipo pizza

- **`pizza_name`**: nome na tabela `pizzas` (ex.: `"Honey Peperoni"`).
- **`size`**: `"small"` (Individual) ou `"large"` (Grande).

### Entradas tipo stock (bebidas, sacos, outros)

- **`stock_item_name`**: nome **exato** do item na tabela `stock_items` do Supabase.
- Se ainda não souberes o nome em stock, usa o placeholder **`[AJUSTAR: nome em stock_items - Vendus: Título do produto]`** — assim sabes qual produto Vendus corresponde e podes substituir depois pelo nome que existir em `stock_items`.

### Exemplo

```json
{
  "_comment": "Pizzas usam pizza_name + size. Outros usam stock_item_name (nome em stock_items). [AJUSTAR: ...] = preencher manualmente.",
  "mappings": [
    { "match_by": "reference", "match_value": "VHON15-2508128", "type": "pizza", "pizza_name": "Honey Peperoni", "size": "large" },
    { "match_by": "reference", "match_value": "VCOC37-25081719", "type": "stock", "stock_item_name": "[AJUSTAR: nome em stock_items - Vendus: Coca Cola Zero 33cl]" }
  ]
}
```

### Nomes das pizzas no Supabase (para copiar)

Para o campo `pizza_name`, usa **exatamente** um destes (conforme o teu seed):

- Creamy Garlic  
- Tomate & Pesto  
- Truffle Shrooms  
- Tuna & Mayo  
- 4 Formaggios+  
- Chicken & Cheese  
- Honey Peperoni  
- Sweet Smoked Shrimp  
- Brigadeiro  
- Cookies and Cream  
- Doce de Leite e Banana  

---

## Onde colocar o ficheiro

Coloca o JSON num destes sítios (diz qual preferes):

1. **`docs/vendus_pizza_mapping.json`** — no repositório, para versionar.  
2. **`vendus_pizza_mapping.json`** na raiz do projeto — igual, mas na raiz.  
3. Outro path que queiras — indicas e usamos esse.

---

## Resumo dos campos

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `match_by` | sim | `"reference"` ou `"title"` (campo Vendus para match). |
| `match_value` | sim | Valor exato desse campo. |
| `type` | sim | `"pizza"` ou `"stock"`. |
| `pizza_name` | se type=pizza | Nome em `pizzas.name` no Supabase. |
| `size` | se type=pizza | `"small"` ou `"large"`. |
| `stock_item_name` | se type=stock | Nome exato em `stock_items.name`. Se não souberes, usa `[AJUSTAR: ... - Vendus: título]` e ajusta depois. |

Quando tiveres o ficheiro preenchido, diz onde o guardaste e seguimos para a migration da tabela de mapeamento + seed + endpoint de consumo.
