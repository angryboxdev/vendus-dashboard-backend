-- Rollback de 20261108100000_supplier_logo.sql. Perde só a ligação ao logótipo (os ficheiros
-- ficam no armazenamento); nenhum outro dado do fornecedor é afetado.
alter table public.suppliers drop column if exists logo_url;
