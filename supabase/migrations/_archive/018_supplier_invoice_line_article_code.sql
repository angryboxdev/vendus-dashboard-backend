-- Código de artigo do fornecedor (para mapeamento futuro e revisão)
alter table public.supplier_invoice_import_lines
  add column if not exists supplier_article_code text;

comment on column public.supplier_invoice_import_lines.supplier_article_code is
  'Referência/código do artigo na fatura do fornecedor (ex.: 019000)';
