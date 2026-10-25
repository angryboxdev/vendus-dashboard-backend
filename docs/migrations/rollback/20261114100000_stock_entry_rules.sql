-- Rollback de 20261114100000_stock_entry_rules.sql. Volta às predefinições (regras gravadas e a sua
-- auditoria perdem-se); revisões, linhas e movimentos não são afetados.
delete from public.stock_review_audit_logs where entity_type = 'stock_entry_rules';
alter table public.stock_review_audit_logs drop constraint if exists stock_review_audit_logs_entity_type_check;
alter table public.stock_review_audit_logs
  add constraint stock_review_audit_logs_entity_type_check check (entity_type in ('stock_purchase_review', 'purchase_presentation'));
drop policy if exists "stock_entry_rules: org-scoped all" on public.stock_entry_rules;
drop table if exists public.stock_entry_rules;
