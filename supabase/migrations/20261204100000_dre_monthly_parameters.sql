-- Parâmetros mensais da DRE (task «Conferência de vendas e DRE», F3 — .scratch/conferencia-vendas-dre):
-- taxas usadas para reconstituir o delivery em bruto a partir do que as plataformas liquidam no banco,
-- a taxa do TPA da conferência de vendas, o IVA teórico dos gastos sem fatura e o marketing das
-- plataformas lançado à mão. Uma linha por empresa e mês; um mês sem linha herda as taxas do último
-- mês com linha (o marketing não se herda).
-- Idempotente. Rollback: docs/migrations/rollback/20261204100000_dre_monthly_parameters.sql

create table if not exists public.dre_monthly_parameters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  year integer not null,
  month integer not null,
  delivery_sales_vat_pct numeric(5,2) not null default 15,
  platform_commission_pct numeric(5,2) not null default 30,
  platform_commission_vat_pct numeric(5,2) not null default 23,
  commission_on_gross boolean not null default true,
  marketing_vat_pct numeric(5,2) not null default 23,
  card_fee_pct numeric(5,2) not null default 1,
  expense_default_vat_pct numeric(5,2) not null default 23,
  marketing_uber_eats_cents bigint not null default 0,
  marketing_glovo_cents bigint not null default 0,
  marketing_bolt_food_cents bigint not null default 0,
  updated_by text null,
  updated_at timestamptz not null default now(),
  constraint dre_monthly_parameters_org_month_key unique (org_id, year, month),
  constraint dre_monthly_parameters_month_check check (month between 1 and 12),
  constraint dre_monthly_parameters_year_check check (year between 2000 and 2100),
  constraint dre_monthly_parameters_pct_check check (
    delivery_sales_vat_pct between 0 and 100
    and platform_commission_pct between 0 and 100
    and platform_commission_vat_pct between 0 and 100
    and marketing_vat_pct between 0 and 100
    and card_fee_pct between 0 and 100
    and expense_default_vat_pct between 0 and 100
  ),
  constraint dre_monthly_parameters_marketing_check check (
    marketing_uber_eats_cents >= 0 and marketing_glovo_cents >= 0 and marketing_bolt_food_cents >= 0
  )
);

alter table public.dre_monthly_parameters enable row level security;
drop policy if exists "dre_monthly_parameters: org-scoped all" on public.dre_monthly_parameters;
create policy "dre_monthly_parameters: org-scoped all"
  on public.dre_monthly_parameters
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());
