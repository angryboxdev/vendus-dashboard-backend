-- Novo RH — organização de demonstração na mesma base de dados (ADR-0034).
-- Só acrescenta colunas com default: as organizações existentes ficam
-- is_demo = false e demo_of = null. Rollback em docs/migrations/rollback/.

alter table public.organizations
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_of uuid;

alter table public.organizations drop constraint if exists organizations_demo_of_fk;
alter table public.organizations
  add constraint organizations_demo_of_fk foreign key (demo_of) references public.organizations (id);

-- Uma demo é sempre de uma organização real; uma real tem no máximo uma demo.
alter table public.organizations drop constraint if exists organizations_demo_consistency_ck;
alter table public.organizations
  add constraint organizations_demo_consistency_ck check (is_demo = (demo_of is not null) and (demo_of is null or demo_of <> id));
create unique index if not exists organizations_demo_of_uq on public.organizations (demo_of) where demo_of is not null;
