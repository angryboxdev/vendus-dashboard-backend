-- Mapeamento directo entre quantidade/unidade da fatura e quantidade/unidade de stock.
-- Ex.: 4000 KG (fatura) → 387 g (stock)
-- Na próxima importação do mesmo produto, usa-se directamente stock_quantity/stock_unit.
ALTER TABLE supplier_article_mappings
  ADD COLUMN IF NOT EXISTS invoice_quantity numeric(14,3),
  ADD COLUMN IF NOT EXISTS invoice_unit     text,
  ADD COLUMN IF NOT EXISTS stock_quantity   numeric(14,3),
  ADD COLUMN IF NOT EXISTS stock_unit       text;
