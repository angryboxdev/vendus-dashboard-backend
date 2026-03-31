-- Adiciona fator de conversão de unidades ao mapeamento de artigos de fornecedor.
-- stock_qty = invoice_qty × quantity_per_invoice_unit
-- Ex.: 1 PC (pack de 10 un) → 10 | 500 g → stock em kg → 0.001

alter table public.supplier_article_mappings
  add column if not exists quantity_per_invoice_unit numeric not null default 1;

comment on column public.supplier_article_mappings.quantity_per_invoice_unit is
  'Fator de conversão de unidades: stock_qty = invoice_qty × este valor (ex.: 10 para pack de 10 un, 0.001 para g→kg)';
