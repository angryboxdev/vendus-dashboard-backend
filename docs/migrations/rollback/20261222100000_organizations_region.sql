-- Rollback de 20261222100000_organizations_region.sql (distrito/região da Empresa).
-- As entidades legais já sincronizadas ficam como estão.

alter table public.organizations drop constraint if exists organizations_region_ck;
alter table public.organizations drop column if exists region;
