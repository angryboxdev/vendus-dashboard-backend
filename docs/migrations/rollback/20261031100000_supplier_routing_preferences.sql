-- Rollback de 20261031100000_supplier_routing_preferences.sql (perde exceções por loja e as novas predefinições).
drop table if exists public.supplier_location_rules;
update public.suppliers set default_stock_policy = 'inherit' where default_stock_policy = 'decide_per_document';
alter table public.suppliers drop constraint if exists suppliers_default_stock_policy_check;
alter table public.suppliers
  add constraint suppliers_default_stock_policy_check
  check (default_stock_policy in ('inherit', 'usually_creates_review', 'usually_skips_review'));
alter table public.suppliers drop constraint if exists suppliers_default_location_fk;
alter table public.suppliers drop column if exists default_location_id, drop column if exists default_financial_mode;
