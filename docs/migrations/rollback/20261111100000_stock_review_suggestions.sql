-- Rollback de 20261111100000_stock_review_suggestions.sql. Só se perdem as sugestões
-- (voltam a ser calculadas ao abrir a revisão); resoluções e movimentos não são afetados.
alter table public.stock_review_lines drop constraint if exists stock_review_lines_suggestion_check;
alter table public.stock_review_lines
  drop column if exists suggested_at,
  drop column if exists suggestion_packaging_changed,
  drop column if exists suggestion_confidence,
  drop column if exists suggested_conversion_factor,
  drop column if exists suggested_stock_item_id,
  drop column if exists suggested_resolution,
  drop column if exists suggestion_source;
