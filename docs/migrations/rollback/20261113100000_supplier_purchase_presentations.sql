-- Rollback de 20261113100000_supplier_purchase_presentations.sql. Perde as apresentações de compra
-- configuradas e a sua auditoria (as associações, fatores já usados e movimentos de Stock não são afetados).
delete from public.stock_review_audit_logs where entity_type = 'purchase_presentation';
alter table public.stock_review_audit_logs drop constraint if exists stock_review_audit_logs_entity_type_check;
alter table public.stock_review_audit_logs
  add constraint stock_review_audit_logs_entity_type_check check (entity_type in ('stock_purchase_review'));
drop policy if exists "supplier_purchase_presentations: org-scoped all" on public.supplier_purchase_presentations;
drop table if exists public.supplier_purchase_presentations;
