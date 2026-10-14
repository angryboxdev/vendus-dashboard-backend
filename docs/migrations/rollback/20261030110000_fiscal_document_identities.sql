-- Rollback de 20261030110000_fiscal_document_identities.sql.
-- As faturas e importações não são tocadas; perde-se só o registo das identidades e a sua auditoria.
drop policy if exists "fiscal_document_audit_logs: org-scoped all" on public.fiscal_document_audit_logs;
drop table if exists public.fiscal_document_audit_logs;
drop policy if exists "fiscal_document_identities: org-scoped all" on public.fiscal_document_identities;
drop table if exists public.fiscal_document_identities;
