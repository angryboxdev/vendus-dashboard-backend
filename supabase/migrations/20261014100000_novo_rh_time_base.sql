-- Novo RH — Fase 3: base do tempo (horários versionados, calendários de
-- feriados e de férias, atribuições com vigência). ADR-0026. Só objetos novos
-- + domínio 'legal' no motor de configurações. Rollback em docs/migrations/rollback/.

-- Motor de configurações: domínio 'legal' (parâmetros legais sem valor — D6).
alter table public.setting_profiles drop constraint if exists setting_profiles_domain_check;
alter table public.setting_profiles add constraint setting_profiles_domain_check
  check (domain in ('security', 'time_tracking', 'notifications', 'legal'));

-- ── Horários (C4.1) ───────────────────────────────────────────────────
create table if not exists public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null check (length(btrim(name)) between 1 and 120),
  kind text not null check (kind in ('fixed', 'flexible')),
  archived boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint work_schedules_org_id_id_key unique (org_id, id)
);
-- CF-13: nomes únicos por organização.
create unique index if not exists work_schedules_name_uq on public.work_schedules (org_id, lower(btrim(name))) where not archived;

create table if not exists public.work_schedule_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  schedule_id uuid not null,
  valid_from date not null,
  valid_to date,
  -- fixo: { "1": [{"start":"09:00","end":"13:00"}, ...], ... }; flexível: { "1": 480, ... } (minutos). Chave = dia ISO (1=segunda).
  days jsonb not null check (jsonb_typeof(days) = 'object'),
  night boolean not null default false,
  half_day_minutes integer check (half_day_minutes is null or half_day_minutes between 0 and 1440),
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint work_schedule_versions_period_ck check (valid_to is null or valid_to >= valid_from),
  constraint work_schedule_versions_schedule_fk foreign key (org_id, schedule_id) references public.work_schedules (org_id, id)
);
create index if not exists work_schedule_versions_idx on public.work_schedule_versions (org_id, schedule_id, valid_from);

-- ── Calendários de feriados (C5.1) ────────────────────────────────────
create table if not exists public.holiday_calendars (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null check (length(btrim(name)) between 1 and 120),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  compensation_coefficient numeric(4, 2) not null default 1 check (compensation_coefficient >= 0 and compensation_coefficient <= 10),
  approval_required boolean not null default false,
  accrued_expires boolean not null default false,
  half_day_compensation boolean not null default false,
  deleted_at timestamptz,
  deleted_by text,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint holiday_calendars_org_id_id_key unique (org_id, id)
);
create unique index if not exists holiday_calendars_name_uq on public.holiday_calendars (org_id, lower(btrim(name))) where deleted_at is null;

create table if not exists public.holiday_calendar_days (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  calendar_id uuid not null,
  date date not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  kind text not null check (kind in ('national', 'regional', 'municipal', 'custom')),
  status text not null default 'to_confirm' check (status in ('to_confirm', 'confirmed')),
  coefficient numeric(4, 2) check (coefficient is null or (coefficient >= 0 and coefficient <= 10)),
  source text check (source is null or length(source) <= 300),
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint holiday_calendar_days_unique unique (org_id, calendar_id, date),
  constraint holiday_calendar_days_calendar_fk foreign key (org_id, calendar_id) references public.holiday_calendars (org_id, id)
);

-- ── Calendários de férias (C5.2; saldos na Fase 5) ────────────────────
create table if not exists public.vacation_calendars (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null check (length(btrim(name)) between 1 and 120),
  unit text not null check (unit in ('days', 'hours')),
  counting text not null check (counting in ('working', 'calendar')),
  limited boolean not null default true,
  -- Sem valor por omissão (D6): o limite legal é preenchido por RH.
  max_amount numeric(6, 2) check (max_amount is null or max_amount >= 0),
  renewal text not null default 'calendar_year' check (renewal in ('calendar_year', 'work_year', 'custom')),
  renewal_start text check (renewal_start is null or renewal_start ~ '^\d{2}-\d{2}$'),
  seniority_rules jsonb not null default '[]'::jsonb check (jsonb_typeof(seniority_rules) = 'array'),
  cumulative boolean not null default false,
  half_day boolean not null default false,
  allow_negative boolean not null default false,
  min_consecutive integer check (min_consecutive is null or min_consecutive >= 1),
  max_consecutive integer check (max_consecutive is null or max_consecutive >= 1),
  advance_months integer check (advance_months is null or advance_months between 0 and 24),
  blocked_dates jsonb not null default '[]'::jsonb check (jsonb_typeof(blocked_dates) = 'array'),
  deleted_at timestamptz,
  deleted_by text,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint vacation_calendars_org_id_id_key unique (org_id, id),
  constraint vacation_calendars_consecutive_ck check (min_consecutive is null or max_consecutive is null or max_consecutive >= min_consecutive)
);
create unique index if not exists vacation_calendars_name_uq on public.vacation_calendars (org_id, lower(btrim(name))) where deleted_at is null;

-- ── Atribuições com vigência ──────────────────────────────────────────
create table if not exists public.time_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  resource_type text not null check (resource_type in ('schedule', 'holiday_calendar', 'vacation_calendar')),
  resource_id uuid not null,
  target_type text not null check (target_type in ('employee', 'group', 'department', 'location')),
  target_id uuid not null,
  valid_from date not null,
  valid_to date,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint time_assignments_period_ck check (valid_to is null or valid_to >= valid_from)
);
create index if not exists time_assignments_resource_idx on public.time_assignments (org_id, resource_type, resource_id);
create index if not exists time_assignments_target_idx on public.time_assignments (org_id, target_type, target_id);

-- ── RLS org-claim ─────────────────────────────────────────────────────
alter table public.work_schedules enable row level security;
alter table public.work_schedule_versions enable row level security;
alter table public.holiday_calendars enable row level security;
alter table public.holiday_calendar_days enable row level security;
alter table public.vacation_calendars enable row level security;
alter table public.time_assignments enable row level security;

drop policy if exists "work_schedules: org-scoped all" on public.work_schedules;
create policy "work_schedules: org-scoped all" on public.work_schedules for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "work_schedule_versions: org-scoped all" on public.work_schedule_versions;
create policy "work_schedule_versions: org-scoped all" on public.work_schedule_versions for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "holiday_calendars: org-scoped all" on public.holiday_calendars;
create policy "holiday_calendars: org-scoped all" on public.holiday_calendars for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "holiday_calendar_days: org-scoped all" on public.holiday_calendar_days;
create policy "holiday_calendar_days: org-scoped all" on public.holiday_calendar_days for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "vacation_calendars: org-scoped all" on public.vacation_calendars;
create policy "vacation_calendars: org-scoped all" on public.vacation_calendars for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "time_assignments: org-scoped all" on public.time_assignments;
create policy "time_assignments: org-scoped all" on public.time_assignments for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
