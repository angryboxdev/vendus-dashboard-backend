-- Rollback de 20261030150000_invoice_amounts_discounts.sql (perde descontos/quadro de IVA registados).
alter table public.invoices drop constraint if exists invoices_rounding_reason_ck;
alter table public.invoices
  drop column if exists gross_cents, drop column if exists discount_cents, drop column if exists global_discount_kind,
  drop column if exists global_discount_value, drop column if exists footer_discount_cents, drop column if exists adjustments_cents,
  drop column if exists rounding_adjustment_cents, drop column if exists rounding_adjustment_reason, drop column if exists vat_summary,
  drop column if exists difference_cents, drop column if exists amounts_validated_at;
alter table public.invoice_lines
  drop column if exists quantity_text, drop column if exists unit_price_text, drop column if exists gross_cents,
  drop column if exists discount_kind, drop column if exists discount_value, drop column if exists discount_cents,
  drop column if exists global_discount_cents, drop column if exists net_cents;
