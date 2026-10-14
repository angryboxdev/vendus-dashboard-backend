-- Fornecedores/Financeiro/Stock v1.2 · F1 §1.2: reimportar o mesmo ficheiro devolve o mesmo documento.
-- O hash ajuda a reconhecer o ficheiro; a identidade fiscal continua a ser a prova de duplicação.
alter table public.invoices add column if not exists file_sha256 text null;
create index if not exists invoices_org_file_sha256_idx on public.invoices (org_id, file_sha256) where file_sha256 is not null;
