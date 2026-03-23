# Ajuste de stock a partir de linhas de produto (receitas)

Ferramenta para **qualquer ajuste manual** em que queres que o sistema **calcule o consumo de ingredientes** (receitas de pizza × tamanho + itens de stock mapeados) a partir de uma lista de produtos Vendus com quantidades — e registe isso como **entradas** em `stock_movements` (`type = adjustment`, quantidade **positiva**).

**Casos de uso (exemplos):**

- Compensar vendas que ocorreram antes de uma contagem física.
- Corrigir um lote / simular devolução com o mesmo critério do painel de consumo.
- Qualquer cenário em que precises do **mesmo motor** que `ingredient-consumption`, sem refazer contas à mão.

Não é cron: corres o script **quando precisares**.

---

## 1. Ficheiro JSON

Array de linhas com **`qty`** e pelo menos um de **`reference`** ou **`title`** (valores em `vendus_product_mapping`).

- **`reference`**: `match_value` onde `match_by = 'reference'` (tentado primeiro).
- **`title`**: `match_by = 'title'`.

Lista **referência + nome** legível no Supabase:

```sql
select
  m.match_value as referencia,
  case
    when m.target_type = 'pizza' then
      p.name || ' (' ||
      case m.pizza_size::text
        when 'small' then 'Individual'
        when 'large' then 'Grande'
        else m.pizza_size::text
      end || ')'
    else coalesce(s.name, '(sem nome)')
  end as nome,
  m.target_type
from public.vendus_product_mapping m
left join public.pizzas p on m.pizza_id = p.id
left join public.stock_items s on m.stock_item_id = s.id
where m.match_by = 'reference'
order by nome, m.match_value;
```

Exemplo: `docs/stock-adjustment-lines.example.json`.

**Catálogo local (só consulta):** `docs/vendus-referencias-catalogo.json` — lista **referência Vendus → nome legível** e `target_type` (pizza | stock). Não é lido pelo script de ajuste; serve para copiares `referencia` ao montar o JSON de linhas com `qty`. Atualiza quando adicionares produtos no mapeamento.

---

## 2. Variáveis de ambiente

| Variável                      | Obrigatório | Descrição                                                                                           |
| ----------------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| `STOCK_ADJUSTMENT_LINES_FILE` | Sim\*       | Caminho para o JSON de linhas.                                                                      |
| `ADJUSTMENT_DATE`             | Sim         | `YYYY-MM-DD` (dia civil para `movement_date`, fim do dia Lisboa).                                   |
| `CRON_DRY_RUN`                | Não         | `1` ou `true` = só simula (`by_item` + `movement_reference`), **não grava**.                        |
| `ADJUSTMENT_BATCH`            | Não         | Sufixo no `reference` da BD se precisares de **vários lotes no mesmo dia** (ex.: `contagem-marco`). |
| `ADJUSTMENT_REASON_NOTE`      | Não         | Texto extra no campo `reason` (ex.: `contagem física 21/03`).                                       |

\*Compat: `EXCLUDED_SALES_FILE` ainda é aceite como alias de `STOCK_ADJUSTMENT_LINES_FILE`.

---

## 3. Comandos

Simular:

```bash
CRON_DRY_RUN=1 STOCK_ADJUSTMENT_LINES_FILE=./docs/stock-adjustment-lines.example.json ADJUSTMENT_DATE=2026-03-21 npx tsx src/jobs/runStockAdjustmentFromLines.ts
```

Aplicar:

```bash
STOCK_ADJUSTMENT_LINES_FILE=./docs/stock-adjustment-lines.example.json ADJUSTMENT_DATE=2026-03-21 npx tsx src/jobs/runStockAdjustmentFromLines.ts
```

Com lote e nota:

```bash
ADJUSTMENT_BATCH=pos-contagem ADJUSTMENT_REASON_NOTE="alinhamento stock 21/03" \
  STOCK_ADJUSTMENT_LINES_FILE=./docs/stock-adjustment-lines.example.json ADJUSTMENT_DATE=2026-03-21 npx tsx src/jobs/runStockAdjustmentFromLines.ts
```

Após build: `npm run stock:adjust-from-lines` (ver `package.json`).

---

## 4. Resposta JSON

Inclui `movement_reference` (valor usado em `stock_movements.reference`) e `by_item` com `stock_item_id`, `name`, `quantity_added`.

---

## 5. O que fica na BD

- `type` = `adjustment`
- `quantity` > 0
- `reason` = `Ajuste manual (equivalente consumo por receitas) — …` (com `ADJUSTMENT_REASON_NOTE` se definido)
- `reference` = `stock-adjustment-lines:YYYY-MM-DD` ou `stock-adjustment-lines:YYYY-MM-DD:lote`
- `created_by` = `stock-adjustment-from-lines`

**Migração de ajustes antigos** (`excluded-before-count:*` / `excluded-sales-adjustment`): continua a aplicar-se o SQL antigo para desfazer esses movimentos; novos usam `stock-adjustment-lines:*` e `stock-adjustment-from-lines`.

---

## 6. Desfazer (novos ajustes)

```sql
delete from public.stock_movements
where created_by = 'stock-adjustment-from-lines'
  and reference = 'stock-adjustment-lines:2026-03-21';
```

Com batch: `and reference like 'stock-adjustment-lines:2026-03-21:%'`.

---

## Documento antigo

O guia `EXCLUDED_SALES_ADJUSTMENT.md` foi unificado aqui — o fluxo é o mesmo, só o nome e os campos na BD mudaram para refletirem uso genérico.
