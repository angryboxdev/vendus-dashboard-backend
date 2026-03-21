# Stock: custos com / sem IVA

Todos os custos de compra são **por `base_unit`** do item.

## Catálogo (`stock_items`)

| Campo | Descrição |
|-------|-----------|
| `purchase_reference_unit_cost_with_vat` | Opcional; referência com IVA |
| `purchase_reference_unit_cost_without_vat` | Opcional; referência sem IVA |

Podem preencher-se um, outro ou ambos.

## Último custo (só leitura na listagem/detalhe)

| Campo | Descrição |
|-------|-----------|
| `last_purchase_unit_cost_with_vat` | Da **última** movimentação `purchase` com esse custo; senão fallback do catálogo |
| `last_purchase_unit_cost_without_vat` | Idem para sem IVA |

A “última compra” é a linha `purchase` com quantidade > 0 e **pelo menos um** dos dois custos preenchidos, ordenada por `movement_date` e `created_at`.

## Movimentações (`POST/PATCH /stock/movements`)

Para compras, enviar opcionalmente:

- `unit_cost_per_base_unit_with_vat`
- `unit_cost_per_base_unit_without_vat`

**Removido:** `unit_cost_per_base_unit` (valor único).

## Migrações

1. `014` — `movement_date` nas movimentações  
2. `015` — (legado) coluna única de referência; **016** migra para com/sem IVA  
3. **`016_stock_cost_with_without_vat.sql`** — colunas duplas em `stock_items` e `stock_movements`, migra dados antigos para **sem IVA**

## Venda

Inalterado: `is_sellable`, `sale_price`.
