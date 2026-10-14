-- Rollback de 20261030140000_invoices_file_sha256.sql.
drop index if exists public.invoices_org_file_sha256_idx;
alter table public.invoices drop column if exists file_sha256;
