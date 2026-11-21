-- Análise de Vendas: cache de dias fechados (blocos dia × hora × canal) e permissão «sales.analysis».
-- Idempotente. Rollback: docs/migrations/rollback/20261223143000_sales_analysis.sql
--
-- Só valores agregados (bruto, líquido, n.º de vendas) — nenhum dado de clientes.
-- Um dia em sales_analysis_days foi guardado por inteiro (mesmo sem vendas) e
-- nunca mais é pedido à fonte (Vendus ou AirMenu).

create table if not exists public.sales_analysis_buckets (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  source text not null check (source in ('vendus', 'airmenu')),
  sale_date date not null,
  hour smallint not null check (hour between 0 and 23),
  channel text not null check (channel in ('salao', 'take_away', 'eatz', 'apps', 'uber_eats', 'glovo', 'bolt_food')),
  gross_cents bigint not null,
  net_cents bigint not null,
  sale_count integer not null,
  unique (org_id, source, sale_date, hour, channel)
);

create index if not exists sales_analysis_buckets_lookup
  on public.sales_analysis_buckets (org_id, source, sale_date);

create table if not exists public.sales_analysis_days (
  org_id uuid not null references public.organizations(id) on delete cascade,
  source text not null check (source in ('vendus', 'airmenu')),
  sale_date date not null,
  synced_at timestamptz not null default now(),
  primary key (org_id, source, sale_date)
);

alter table public.sales_analysis_buckets enable row level security;
alter table public.sales_analysis_days enable row level security;

drop policy if exists "sales_analysis_buckets: org-scoped read" on public.sales_analysis_buckets;
create policy "sales_analysis_buckets: org-scoped read" on public.sales_analysis_buckets
  for select to authenticated using (org_id = current_org());

drop policy if exists "sales_analysis_days: org-scoped read" on public.sales_analysis_days;
create policy "sales_analysis_days: org-scoped read" on public.sales_analysis_days
  for select to authenticated using (org_id = current_org());

revoke insert, update, delete on public.sales_analysis_buckets from anon, authenticated;
revoke insert, update, delete on public.sales_analysis_days from anon, authenticated;

-- Permissão: Admin (MANAGE) e Gerência/Manager (READ). Os outros perfis só com concessão manual.
update public.access_profiles
  set permissions = permissions || '{"sales.analysis": "MANAGE"}'::jsonb, version = version + 1, updated_at = now()
  where system_key = 'admin' and not (permissions ? 'sales.analysis');
update public.access_profiles
  set permissions = permissions || '{"sales.analysis": "READ"}'::jsonb, version = version + 1, updated_at = now()
  where system_key = 'manager' and not (permissions ? 'sales.analysis');
