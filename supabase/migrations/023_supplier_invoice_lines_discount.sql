-- Guarda o desconto da linha da fatura (decimal 0–1, ex.: 0.10 para 10%).
alter table public.supplier_invoice_import_lines
  add column if not exists discount_pct numeric;

comment on column public.supplier_invoice_import_lines.discount_pct is
  'Desconto total da linha em decimal (0.10 = 10%). Nulo se sem desconto.';
