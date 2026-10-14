-- Rollback de 20261031110000_invoice_financial_modes.sql (perde as repartições «Por valores»;
-- essas faturas voltam a «Única», sem classificação — rever à mão antes de reverter).
drop table if exists public.invoice_allocations;
update public.invoices set line_detail_mode = 'simple' where line_detail_mode = 'by_values';
alter table public.invoices drop constraint if exists invoices_line_detail_mode_check;
alter table public.invoices
  add constraint invoices_line_detail_mode_check check (line_detail_mode in ('simple', 'detailed'));
