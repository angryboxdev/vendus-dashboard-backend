# Importação de faturas de fornecedor (OpenAI + Supabase Storage)

## Variáveis de ambiente

| Variável                             | Descrição                                        |
| ------------------------------------ | ------------------------------------------------ |
| `OPENAI_API_KEY`                     | Obrigatória para extrair dados da fatura.        |
| `OPENAI_MODEL_TEXT`                  | Default: `gpt-4o-mini` (PDF com texto extraído). |
| `OPENAI_MODEL_VISION`                | Default: `gpt-4o` (imagens JPG/PNG/WebP).        |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Storage + tabelas.                               |

## Migração

Aplicar `supabase/migrations/017_supplier_invoice_imports.sql` (tabelas + bucket `invoice-imports`).

## API

| Método | Path                                     | Descrição                                                                                                                                                     |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/stock/invoice-imports`             | `multipart/form-data`, campo `file`. Devolve import com linhas e estado `ready_for_review` ou `failed`.                                                       |
| GET    | `/api/stock/invoice-imports/:id`         | Detalhe + linhas.                                                                                                                                             |
| POST   | `/api/stock/invoice-imports/:id/confirm` | Body JSON: `{ "override_duplicate": true/false, "lines": [...] }`. Cria `stock_movements` (`purchase`) e atualiza `purchase_reference_unit_cost_*` nos itens. |

### Duplicados

Chave lógica: hash de (fornecedor + nº fatura + data). Se já existir import **confirmado** com a mesma chave, `duplicate_warning: true`. Para substituir: `override_duplicate: true` (remove movimentos do import anterior confirmado, cancela esse import, aplica o novo).

### Referências no stock

- `stock_movements.created_by` = `supplier-invoice-import`
- `stock_movements.reference` = `invoice-import:{import_id}`

## Formatos

- **PDF** com texto selecionável: texto extraído localmente + modelo texto.
- **PDF** digitalizado sem texto: erro pedindo **JPG/PNG** ou PDF com texto.
- **JPG/PNG/WebP**: modelo visão.

## Pós-processamento (IVA e totais)

Após a OpenAI, o backend:

- Normaliza `vat_rate` (ex.: `23` → `0.23`).
- Se `vat_rate > 0` e `unit_price_gross` ≈ `unit_price_net`, recalcula **bruto = líquido × (1 + IVA)**.
- Idem para `line_total_gross` a partir de `line_total_net`.
- Se `quantity > 1` e o total da linha coincide com o **preço unitário** (erro comum de extração), recalcula totais como `quantity ×` preço unitário.

Cada linha pode incluir `supplier_article_code` (código na grelha do fornecedor) — migração `018_*`.
