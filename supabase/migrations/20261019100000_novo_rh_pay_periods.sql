-- Novo RH — Fase 8: períodos, fechos (fotografia append-only), reaberturas
-- com dupla aprovação e exportações assíncronas com links que expiram
-- (ADR-0031). Só objetos novos. Rollback em docs/migrations/rollback/.

create table if not exists public.pay_periods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  scope_type text not null check (scope_type in ('organization', 'location')),
  scope_id uuid,
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open', 'closed', 'reopened')),
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint pay_periods_dates_ck check (end_date >= start_date and end_date - start_date <= 92),
  constraint pay_periods_scope_ck check ((scope_type = 'organization') = (scope_id is null)),
  constraint pay_periods_org_id_uq unique (org_id, id)
);
create index if not exists pay_periods_dates_idx on public.pay_periods (org_id, start_date, end_date);

create table if not exists public.pay_period_closures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  period_id uuid not null,
  closure_no integer not null,
  closed_by text not null,
  -- Exceção explícita: motivo + a lista exata dos pendentes no momento do fecho.
  exception_reason text,
  exceptions jsonb not null default '[]'::jsonb,
  -- Fotografia: totais por colaborador (TK-19).
  totals jsonb not null,
  -- Diferenças face ao fecho anterior (depois de uma reabertura).
  diff jsonb,
  created_at timestamptz not null default now(),
  constraint pay_period_closures_uq unique (org_id, period_id, closure_no),
  constraint pay_period_closures_period_fk foreign key (org_id, period_id) references public.pay_periods (org_id, id)
);
drop trigger if exists pay_period_closures_append_only on public.pay_period_closures;
create trigger pay_period_closures_append_only before update or delete on public.pay_period_closures
  for each row execute function public.forbid_append_only_changes();

create table if not exists public.pay_period_reopenings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  period_id uuid not null,
  requested_by text not null,
  requested_by_user_id text not null,
  reason text not null check (length(btrim(reason)) > 0),
  -- [{ "userId": "...", "by": "...", "at": "..." }] — 2 distintos, nenhum é quem pediu (TK-18).
  approvals jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint pay_period_reopenings_period_fk foreign key (org_id, period_id) references public.pay_periods (org_id, id)
);
create unique index if not exists pay_period_reopenings_pending_uq on public.pay_period_reopenings (org_id, period_id) where status = 'pending';

create table if not exists public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  period_id uuid not null,
  kind text not null check (kind in ('payroll', 'billing_location')),
  requested_by text not null,
  requested_by_user_id text not null,
  include_sensitive boolean not null default false,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  error text,
  file_name text,
  content text,
  totals jsonb,
  token text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint export_jobs_period_fk foreign key (org_id, period_id) references public.pay_periods (org_id, id)
);
create index if not exists export_jobs_user_idx on public.export_jobs (org_id, requested_by_user_id, created_at);

alter table public.pay_periods enable row level security;
alter table public.pay_period_closures enable row level security;
alter table public.pay_period_reopenings enable row level security;
alter table public.export_jobs enable row level security;

drop policy if exists "pay_periods: org-scoped all" on public.pay_periods;
create policy "pay_periods: org-scoped all" on public.pay_periods for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "pay_period_closures: org-scoped all" on public.pay_period_closures;
create policy "pay_period_closures: org-scoped all" on public.pay_period_closures for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "pay_period_reopenings: org-scoped all" on public.pay_period_reopenings;
create policy "pay_period_reopenings: org-scoped all" on public.pay_period_reopenings for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "export_jobs: org-scoped all" on public.export_jobs;
create policy "export_jobs: org-scoped all" on public.export_jobs for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
