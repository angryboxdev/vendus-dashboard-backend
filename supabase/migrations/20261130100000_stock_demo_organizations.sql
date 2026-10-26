-- Demonstração do Stock (3 cenários fictícios: comida brasileira, hamburgueria, bar). Só aditiva: não altera
-- nenhuma tabela existente nem a demonstração do RH (organizations.demo_of e o seu índice ficam como estão).
-- As organizações fictícias do Stock são organizations.is_demo = true com demo_of = null; a ligação
-- empresa real → cenário vive aqui. Idempotente.
-- Rollback: docs/migrations/rollback/20261130100000_stock_demo_organizations.sql

create table if not exists public.stock_demo_organizations (
  id uuid primary key default gen_random_uuid(),
  -- Empresa REAL (a do Admin que cria a demonstração).
  org_id uuid not null references public.organizations(id),
  scenario text not null check (scenario in ('brasileira', 'hamburgueria', 'bar')),
  -- Organização fictícia onde vivem os dados do cenário (is_demo = true).
  demo_org_id uuid not null references public.organizations(id) on delete cascade,
  -- Semente do gerador: a mesma semente dá sempre os mesmos dados.
  seed integer not null default 42,
  -- Vendas mensais em pratos do POS fictício (50 000–70 000 €).
  monthly_sales_target_cents bigint not null check (monthly_sales_target_cents between 5000000 and 7000000),
  -- POS fictício (nome inventado; não é um software real) e pista da chave fictícia mostrada no ecrã.
  pos_name text not null default 'CaixaFlow POS',
  pos_api_key_hint text not null,
  created_by text null,
  created_at timestamptz not null default now(),
  constraint stock_demo_organizations_org_scenario_key unique (org_id, scenario),
  constraint stock_demo_organizations_demo_org_key unique (demo_org_id)
);

alter table public.stock_demo_organizations enable row level security;

drop policy if exists "stock_demo_organizations: org-scoped all" on public.stock_demo_organizations;
create policy "stock_demo_organizations: org-scoped all"
  on public.stock_demo_organizations
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

comment on table public.stock_demo_organizations is 'Demonstração do Stock: cenários fictícios por empresa real (organização fictícia, semente, vendas mensais do POS fictício).';
