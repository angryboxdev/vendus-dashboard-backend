-- Novo RH — Fase 5: tipos de ausência, pedidos, fluxos de aprovação
-- multinível e saldos em ledger append-only (ADR-0028).
-- Só objetos novos (+ permissão especial nos perfis de sistema).
-- Rollback em docs/migrations/rollback/.

create table if not exists public.absence_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null check (length(btrim(name)) between 1 and 120),
  code text check (code is null or length(code) <= 40),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  category text not null check (category in ('vacation', 'permission', 'medical', 'compensation')),
  unit text not null default 'days' check (unit in ('days', 'hours')),
  counting text not null default 'working' check (counting in ('working', 'calendar')),
  -- Sem valor = sem limite (nenhum valor legal por omissão — D6).
  limit_amount numeric(8, 2) check (limit_amount is null or limit_amount >= 0),
  renewal text not null default 'calendar_year' check (renewal in ('calendar_year', 'work_year')),
  allow_negative boolean not null default false,
  carry_over boolean not null default false,
  requires_approval boolean not null default true,
  private boolean not null default false,
  hidden_from_employee boolean not null default false,
  attachment text not null default 'none' check (attachment in ('none', 'optional', 'required')),
  time_impact text not null default 'reduce_theoretical' check (time_impact in ('reduce_theoretical', 'count_as_worked', 'none')),
  intersect_schedule boolean not null default true,
  half_day boolean not null default false,
  min_consecutive integer check (min_consecutive is null or min_consecutive >= 1),
  max_consecutive integer check (max_consecutive is null or max_consecutive >= 1),
  blocked_dates jsonb not null default '[]'::jsonb,
  paid boolean not null default true,
  flow_id uuid,
  archived boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint absence_types_org_id_uq unique (org_id, id)
);
create unique index if not exists absence_types_name_uq on public.absence_types (org_id, lower(name)) where not archived;

create table if not exists public.approval_flows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null check (length(btrim(name)) between 1 and 80),
  scope text not null default 'absences' check (scope in ('absences', 'clock')),
  is_default boolean not null default false,
  -- [{ "people": [userId], "roles": ["managers" | "profile:<uuid>"] }]
  levels jsonb not null check (jsonb_typeof(levels) = 'array' and jsonb_array_length(levels) between 1 and 5),
  fallback_user_ids jsonb not null default '[]'::jsonb,
  archived boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint approval_flows_org_id_uq unique (org_id, id)
);
create unique index if not exists approval_flows_default_uq on public.approval_flows (org_id, scope) where is_default and not archived;

alter table public.absence_types drop constraint if exists absence_types_flow_fk;
alter table public.absence_types add constraint absence_types_flow_fk foreign key (org_id, flow_id) references public.approval_flows (org_id, id);

create table if not exists public.absence_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  type_id uuid not null,
  kind text not null default 'absence' check (kind in ('absence', 'holiday_compensation')),
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  half_day boolean not null default false,
  amount numeric(8, 2) not null check (amount >= 0),
  unit text not null check (unit in ('days', 'hours')),
  period text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  comment text,
  attachment_document_id uuid,
  requested_by text not null,
  requested_by_user_id text,
  -- Aprovadores resolvidos na criação, por nível (fotografia).
  levels jsonb not null default '[]'::jsonb,
  current_level integer not null default 0,
  decided_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  constraint absence_requests_dates_ck check (end_date >= start_date),
  constraint absence_requests_times_ck check ((start_time is null) = (end_time is null)),
  constraint absence_requests_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id),
  constraint absence_requests_type_fk foreign key (org_id, type_id) references public.absence_types (org_id, id),
  constraint absence_requests_org_id_uq unique (org_id, id)
);
create index if not exists absence_requests_employee_idx on public.absence_requests (org_id, employee_id, start_date);
create index if not exists absence_requests_status_idx on public.absence_requests (org_id, status, created_at);

create table if not exists public.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  request_id uuid not null,
  level integer not null,
  actor text not null,
  actor_user_id text,
  decision text not null check (decision in ('approve', 'reject', 'escalated', 'cancel')),
  comment text,
  created_at timestamptz not null default now(),
  constraint approval_decisions_request_fk foreign key (org_id, request_id) references public.absence_requests (org_id, id)
);
create index if not exists approval_decisions_request_idx on public.approval_decisions (org_id, request_id, created_at);

create table if not exists public.leave_balance_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  type_id uuid not null,
  period text not null,
  kind text not null check (kind in ('accrual', 'request', 'reversal', 'adjustment', 'expiry', 'carryover', 'holiday_compensation')),
  amount numeric(8, 2) not null,
  unit text not null check (unit in ('days', 'hours')),
  request_id uuid,
  reference_date date,
  reason text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint leave_balance_entries_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id),
  constraint leave_balance_entries_type_fk foreign key (org_id, type_id) references public.absence_types (org_id, id)
);
create index if not exists leave_balance_entries_idx on public.leave_balance_entries (org_id, employee_id, type_id, period);
-- Uma acumulação por (colaborador, tipo, período); uma compensação por feriado.
create unique index if not exists leave_balance_accrual_uq on public.leave_balance_entries (org_id, employee_id, type_id, period) where kind = 'accrual';
create unique index if not exists leave_balance_holiday_uq on public.leave_balance_entries (org_id, employee_id, reference_date) where kind = 'holiday_compensation';

create or replace function public.forbid_append_only_changes() returns trigger
language plpgsql as $$
begin
  raise exception '% é append-only: registe um movimento novo', tg_table_name;
end;
$$;
drop trigger if exists leave_balance_entries_append_only on public.leave_balance_entries;
create trigger leave_balance_entries_append_only before update or delete on public.leave_balance_entries
  for each row execute function public.forbid_append_only_changes();
drop trigger if exists approval_decisions_append_only on public.approval_decisions;
create trigger approval_decisions_append_only before update or delete on public.approval_decisions
  for each row execute function public.forbid_append_only_changes();

alter table public.absence_types enable row level security;
alter table public.approval_flows enable row level security;
alter table public.absence_requests enable row level security;
alter table public.approval_decisions enable row level security;
alter table public.leave_balance_entries enable row level security;

drop policy if exists "absence_types: org-scoped all" on public.absence_types;
create policy "absence_types: org-scoped all" on public.absence_types for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "approval_flows: org-scoped all" on public.approval_flows;
create policy "approval_flows: org-scoped all" on public.approval_flows for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "absence_requests: org-scoped all" on public.absence_requests;
create policy "absence_requests: org-scoped all" on public.absence_requests for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "approval_decisions: org-scoped all" on public.approval_decisions;
create policy "approval_decisions: org-scoped all" on public.approval_decisions for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "leave_balance_entries: org-scoped all" on public.leave_balance_entries;
create policy "leave_balance_entries: org-scoped all" on public.leave_balance_entries for all to authenticated using (org_id = current_org()) with check (org_id = current_org());

-- Permissão especial: ver e gerir ausências privadas (ADR-0028).
update public.access_profiles set permissions = permissions || '{"hr.absences_private": "MANAGE"}'::jsonb, version = version + 1, updated_at = now() where system_key = 'admin';
update public.access_profiles set permissions = permissions || '{"hr.absences_private": "MANAGE"}'::jsonb, version = version + 1, updated_at = now() where system_key = 'rh';
