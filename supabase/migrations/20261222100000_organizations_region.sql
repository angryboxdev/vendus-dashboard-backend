-- Empresa & Estrutura → Empresa: distrito/região da morada fiscal.
-- A Empresa passa a ser a fonte do emitente das faturas (entidade legal com o
-- mesmo NIF), e a entidade legal exige região. Coluna opcional: organizações
-- antigas ficam sem valor até alguém gravar a Empresa.
-- Idempotente. Rollback: docs/migrations/rollback/20261222100000_organizations_region.sql

alter table public.organizations add column if not exists region text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_region_ck') then
    alter table public.organizations add constraint organizations_region_ck
      check (region is null or length(btrim(region)) between 2 and 80);
  end if;
end $$;
