# Design – Painel: Consumo de Ingredientes

## Objetivo

Endpoint para a página **Painel**: mostrar **quais ingredientes e quanto** foram consumidos num período (por default: ontem), com base nas vendas Vendus e nas receitas de pizzas.

---

## 1. Fonte de dados

- **Vendas**: `buildMonthlySummary({ since, until, ... })` → `response.products_overall`
- Cada item em `products_overall` tem: `reference`, `title`, `category`, `qty`, amounts, etc.
- **Só pizzas** entram no cálculo de consumo (por agora): `category === "pizza"`.
- Bebidas/outros: sem vínculo a `stock_items` por agora; podemos estender depois.

---

## 2. Matching produto Vendus → pizza + size

- **Regra**: o `title` segue o padrão `"Nome da Pizza (Tamanho)"`.
- **Exemplos**:
  - `"Honey Peperoni (Grande)"` → pizza `"Honey Peperoni"`, size `large`
  - `"Honey Peperoni (Individual)"` → pizza `"Honey Peperoni"`, size `small`
- **Normalização de tamanho** (proposta):

  | Texto no title (dentro dos parênteses) | `pizza_size` |
  | -------------------------------------- | ------------ |
  | Grande                                 | `large`      |
  | Individual, Pequena                    | `small`      |

- **Parsing**: extrair com regex o grupo antes de `(...)` = nome da pizza; o conteúdo dos parênteses = tamanho (normalizar para `small`/`large`).
- **Lookup**: buscar em `pizzas` por `name` (trim, case-insensitive). Se não existir ou não houver receita ativa, vamos logar em debug.

**Pergunta para ti**: no Vendus aparecem só "Grande" e "Individual", ou também "Pequena"? E há outros tamanhos (ex.: "Média") que queiras mapear?
Resposta: "Grande" e "Individual"

---

## 3. Cálculo de consumo (só pizzas)

Para cada produto em `products_overall` com `category === "pizza"` e que faça match com uma pizza + size:

1. Obter a **receita ativa** dessa pizza (`pizza_recipes` com `is_active = true`).
2. Obter os **itens da receita** para esse `size` (`pizza_recipe_items` com esse `recipe_id` e `size`).
3. Para cada item: `quantity_consumed += recipe_item.quantity * product.qty`.
4. Agregar por `stock_item_id` (soma de `quantity_consumed`).

A quantidade está na **base_unit** do `stock_items` (ex.: gramas). O resultado final é “quantidade consumida por ingrediente (stock_item)” no período.

---

## 4. Endpoint proposto

**GET** `/api/reports/ingredient-consumption?since=YYYY-MM-DD&until=YYYY-MM-DD`

- **Query params**:
  - `since` (opcional): início do período (inclusivo). **Default**: ontem (um único dia).
  - `until` (opcional): fim do período (inclusivo). **Default**: ontem.
- Assim, sem parâmetros = “consumo de ontem”.

**Resposta 200** (proposta):

```ts
{
  period: { since: string; until: string; timezone?: string };
  consumption: Array<{
    stock_item_id: string;
    name: string;           // do stock_items (para mostrar na UI)
    base_unit: string;       // ex. "g"
    quantity_consumed: number;
  }>;
  // opcional: resumo de vendas de pizzas usadas no cálculo (debug/transparência)
  matched_products?: Array<{
    title: string;
    pizza_name: string;
    size: "small" | "large";
    qty_sold: number;
  }>;
}
```

Resposta: Adicionar debug

- `consumption`: apenas ingredientes com `quantity_consumed > 0`, ordenados por exemplo por `quantity_consumed` desc ou por `name`.
- Incluir `name` e `base_unit` evita o frontend ter de chamar a API de stock para cada id.

**Pergunta**: preferes que o default `since`/`until` seja “ontem” no **backend** (e o frontend só envia quando quer outro intervalo), ou que o frontend envie sempre o intervalo (ex.: sempre “ontem” por defeito no frontend)?
Resposta: pode deixar no backend como default, mas vou enviar no front tbm

---

## 5. Vínculo explícito Vendus ↔ pizzas (opcional)

- Hoje não existe no DB nenhum campo tipo `vendus_reference` ou `vendus_title` em `pizzas`.
- O matching é **só por parsing do title** ("Nome da Pizza (Tamanho)").
- Se no futuro existirem títulos Vendus que não sigam este padrão, podemos:
  - **Opção A**: Criar uma tabela de mapeamento, ex. `vendus_product_mapping (vendus_reference ou title_pattern, pizza_id, size)` e usar isso em vez do parsing.
  - **Opção B**: Manter o parsing e adicionar uma lista de exceções (ex. config ou doc) que tu preenches.

Se quiseres, podes fazer um doc (ex.: lista em JSON ou tabela) com “title Vendus → nome pizza + size” para os casos especiais e integramos isso no endpoint.

---

## 6. Resumo para implementação

| Item            | Decisão                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Fonte           | `products_overall` do monthly-summary (since/until)                                                 |
| Filtro          | Só `category === "pizza"`                                                                           |
| Matching        | Tabela `vendus_product_mapping` (reference/title → pizza_id+size ou stock_item_id); seed a partir de `docs/vendus_pizza_mapping.json` (entradas `[IGNORAR...]` não inseridas). |
| Consumo         | Receita ativa + itens por size; quantity × qty_sold; agregar por stock_item_id. |
| Endpoint        | GET `/api/reports/ingredient-consumption?since=&until=` |
| Default período | Ontem (backend). |
| Response        | `period` + `consumption[]` (stock_item_id, name, base_unit, quantity_consumed) + `matched_products` + `debug`. |

**Implementado**: migration 013 (vendus_product_mapping), seed_vendus_mapping.sql, endpoint ingredient-consumption, Focaccia com receita no seed_pizzas.
