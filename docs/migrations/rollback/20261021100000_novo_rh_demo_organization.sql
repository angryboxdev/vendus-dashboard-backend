-- Rollback de 20261021100000_novo_rh_demo_organization.sql
-- Se já existir uma organização de demonstração, os seus dados (append-only)
-- ficam; o rollback só remove as colunas depois de a organização demo deixar
-- de ser usada pelo backend (versão anterior). Não apaga organizações.

drop index if exists public.organizations_demo_of_uq;
alter table public.organizations drop constraint if exists organizations_demo_consistency_ck;
alter table public.organizations drop constraint if exists organizations_demo_of_fk;
-- As colunas só se removem se não houver nenhuma organização demo:
do $$ begin
  if not exists (select 1 from public.organizations where is_demo) then
    alter table public.organizations drop column if exists demo_of;
    alter table public.organizations drop column if exists is_demo;
  end if;
end $$;
