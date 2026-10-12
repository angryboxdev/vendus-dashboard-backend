-- Novo RH — Fase 6: banco de horas em ledger append-only, validação de
-- excedente e horas categorizadas (ADR-0029). Só objetos novos.
-- Rollback em docs/migrations/rollback/.

create table if not exists public.time_bank_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  kind text not null check (kind in ('excess', 'deficit', 'multiplier', 'holiday', 'compensation_rest', 'compensation_paid', 'expiry', 'adjustment')),
  seconds integer not null,
  -- Dia a que o movimento diz respeito (ajustes: o dia corrigido; compensações: o dia do pedido).
  work_date date not null,
  -- Dia em que o movimento foi lançado (ajustes de correção retroativa: hoje).
  posted_on date not null,
  payment_month text check (payment_month is null or payment_month ~ '^\d{4}-\d{2}$'),
  reason text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint time_bank_entries_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id)
);
create index if not exists time_bank_entries_idx on public.time_bank_entries (org_id, employee_id, work_date);
-- Um movimento diário de cada tipo por dia: correções entram como ajuste.
create unique index if not exists time_bank_daily_uq on public.time_bank_entries (org_id, employee_id, work_date, kind) where kind in ('excess', 'deficit', 'multiplier', 'holiday');

drop trigger if exists time_bank_entries_append_only on public.time_bank_entries;
create trigger time_bank_entries_append_only before update or delete on public.time_bank_entries
  for each row execute function public.forbid_append_only_changes();

create table if not exists public.time_bank_validations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  work_date date not null,
  status text not null check (status in ('approved', 'rejected')),
  comment text,
  decided_by text not null,
  decided_at timestamptz not null default now(),
  constraint time_bank_validations_uq unique (org_id, employee_id, work_date),
  constraint time_bank_validations_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id)
);

create table if not exists public.hour_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null check (length(btrim(name)) between 1 and 80),
  valid_from date not null,
  valid_to date,
  -- [{ "weekdays": ["1".."7"], "start": "HH:MM", "end": "HH:MM" }]
  windows jsonb not null check (jsonb_typeof(windows) = 'array' and jsonb_array_length(windows) between 1 and 20),
  -- Fator > 1 gera o movimento "multiplicador"; null = só classificação.
  factor numeric(4, 2) check (factor is null or (factor > 0 and factor <= 5)),
  archived boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint hour_categories_period_ck check (valid_to is null or valid_to >= valid_from)
);
create unique index if not exists hour_categories_name_uq on public.hour_categories (org_id, lower(name)) where not archived;

alter table public.time_bank_entries enable row level security;
alter table public.time_bank_validations enable row level security;
alter table public.hour_categories enable row level security;

drop policy if exists "time_bank_entries: org-scoped all" on public.time_bank_entries;
create policy "time_bank_entries: org-scoped all" on public.time_bank_entries for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "time_bank_validations: org-scoped all" on public.time_bank_validations;
create policy "time_bank_validations: org-scoped all" on public.time_bank_validations for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "hour_categories: org-scoped all" on public.hour_categories;
create policy "hour_categories: org-scoped all" on public.hour_categories for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
