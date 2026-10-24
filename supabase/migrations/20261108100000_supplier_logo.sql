-- Leitor inteligente E3b-1: logótipo do fornecedor (proposto a partir da fatura,
-- só gravado quando a pessoa confirma). Só uma coluna nova e opcional. Idempotente.
alter table public.suppliers
  add column if not exists logo_url text null;

comment on column public.suppliers.logo_url is 'URL público do logótipo do fornecedor (armazenamento da organização).';
