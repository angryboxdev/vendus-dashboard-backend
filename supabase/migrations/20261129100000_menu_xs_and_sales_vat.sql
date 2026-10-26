-- Fichas técnicas V7: (1) variante XS dos pratos (doces: metade da pequena) e (2) taxa de IVA das
-- vendas por empresa, para a margem teórica dos pratos (PVP com IVA → PVP sem IVA − custo).
-- Idempotente. Rollback: docs/migrations/rollback/20261129100000_menu_xs_and_sales_vat.sql

-- (1) Novo valor do enum usado por pizza_prices, pizza_recipe_items e vendus_product_mapping.
-- Não é usado nesta migração (o Postgres não deixa usar um valor novo na mesma transação).
alter type public.pizza_size add value if not exists 'xs' before 'small';

-- (2) Definições do custo das fichas técnicas, uma linha por empresa. Sem linha = predefinição
-- (13%, taxa intermédia que a Vendus aplica aos pratos), resolvida no código.
create table if not exists public.menu_costing_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  sales_vat_rate numeric(5, 2) not null check (sales_vat_rate >= 0 and sales_vat_rate <= 100),
  updated_by text null,
  updated_at timestamptz not null default now(),
  constraint menu_costing_settings_org_key unique (org_id)
);

alter table public.menu_costing_settings enable row level security;

drop policy if exists "menu_costing_settings: org-scoped all" on public.menu_costing_settings;
create policy "menu_costing_settings: org-scoped all"
  on public.menu_costing_settings
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

comment on table public.menu_costing_settings is 'Definições das Fichas técnicas por empresa: taxa de IVA das vendas usada na margem dos pratos.';
