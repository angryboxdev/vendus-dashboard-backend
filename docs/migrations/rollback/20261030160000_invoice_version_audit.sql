-- Rollback de 20261030160000_invoice_version_audit.sql (perde o histórico de auditoria e as versões).
drop table if exists public.invoice_audit_logs;
alter table public.invoices drop column if exists version;
