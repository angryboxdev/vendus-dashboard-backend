-- Rollback de 20261117100000_stock_settings_default_location.sql: remove a localização principal do Stock.
-- Com várias lojas ativas, a confirmação volta a pedir a loja.

delete from public.stock_review_audit_logs where entity_type = 'stock_settings';
alter table public.stock_review_audit_logs drop constraint if exists stock_review_audit_logs_entity_type_check;
alter table public.stock_review_audit_logs
  add constraint stock_review_audit_logs_entity_type_check check (entity_type in ('stock_purchase_review', 'purchase_presentation', 'stock_entry_rules'));

drop table if exists public.stock_settings;
