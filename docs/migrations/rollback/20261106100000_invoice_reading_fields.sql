-- Rollback de 20261106100000_invoice_reading_fields.sql (ordem inversa).
-- Perde só os metadados da leitura (código do artigo, QR, origem); valores, linhas e
-- classificações das faturas não são afetados.

alter table public.invoices drop constraint if exists invoices_reading_source_check;
alter table public.invoices
  drop column if exists reading_source,
  drop column if exists fiscal_qr;

drop index if exists public.invoice_lines_org_supplier_item_code_idx;
alter table public.invoice_lines
  drop column if exists reading_meta,
  drop column if exists supplier_item_code;
