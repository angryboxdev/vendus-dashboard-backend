-- RH 2.0 — ticket 03 "Automatizações" (.scratch/rh-2-0).
--
-- 1) `hr_shift_automations`: regra guardada — Modelo + público (reavaliado
--    em cada geração) + local opcional + dias da semana + início/fim
--    opcional + Ativa/Pausada + horizonte (semanas). `generated_until`
--    regista até onde já se gerou: cada geração só cobre datas novas, até
--    ao horizonte (nunca para lá dele) — um turno apagado à mão dentro do
--    período já gerado não volta a aparecer.
--    `kind` fica preparado para a rotação A/B (ticket 04).
-- 2) `hr_shift_automation_issues`: ocorrências que a geração não criou
--    (conflito, ausência, sem local…) — mostradas em "Alertas e ações"
--    até serem dispensadas. Uma por automatização × colaborador × dia.
-- 3) `hr_work_shifts.automation_id`: origem do turno (snapshot + referência).
--
-- Aditivo e reexecutável.

create table if not exists public.hr_shift_automations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null check (length(btrim(name)) > 0),
  description text,
  kind text not null default 'weekly',
  template_id uuid not null,
  audience jsonb not null,
  location_id uuid,
  weekdays smallint[] not null default '{}',
  start_date date not null,
  end_date date,
  horizon_weeks smallint not null default 4 check (horizon_weeks between 1 and 12),
  status text not null default 'active' check (status in ('active', 'paused')),
  generated_until date,
  last_run_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_shift_automations_org_id_id_key unique (org_id, id),
  constraint hr_shift_automations_kind_check check (kind in ('weekly')),
  constraint hr_shift_automations_weekdays_check check (weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  constraint hr_shift_automations_dates_check check (end_date is null or end_date >= start_date),
  constraint hr_shift_automations_org_id_template_id_fkey
    foreign key (org_id, template_id) references public.hr_shift_templates(org_id, id),
  constraint hr_shift_automations_org_id_location_id_fkey
    foreign key (org_id, location_id) references public.locations(org_id, id)
);

create index if not exists hr_shift_automations_org_id_idx on public.hr_shift_automations (org_id);

alter table public.hr_shift_automations enable row level security;

drop policy if exists "hr_shift_automations: org-scoped all" on public.hr_shift_automations;
create policy "hr_shift_automations: org-scoped all"
  on public.hr_shift_automations
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

create table if not exists public.hr_shift_automation_issues (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  automation_id uuid not null,
  employee_id uuid not null,
  work_date date not null,
  status text not null check (status in ('overlap', 'leave', 'inactive_employee', 'no_location', 'inactive_location', 'inactive_template')),
  detected_at timestamptz not null default now(),
  dismissed_at timestamptz,
  dismissed_by text,
  constraint hr_shift_automation_issues_unique unique (org_id, automation_id, employee_id, work_date),
  constraint hr_shift_automation_issues_org_id_automation_id_fkey
    foreign key (org_id, automation_id) references public.hr_shift_automations(org_id, id),
  constraint hr_shift_automation_issues_org_id_employee_id_fkey
    foreign key (org_id, employee_id) references public.hr_employees(org_id, id)
);

create index if not exists hr_shift_automation_issues_org_date_idx
  on public.hr_shift_automation_issues (org_id, work_date)
  where dismissed_at is null;

alter table public.hr_shift_automation_issues enable row level security;

drop policy if exists "hr_shift_automation_issues: org-scoped all" on public.hr_shift_automation_issues;
create policy "hr_shift_automation_issues: org-scoped all"
  on public.hr_shift_automation_issues
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- ── Origem do turno ──────────────────────────────────────────────────────

alter table public.hr_work_shifts
  add column if not exists automation_id uuid;

alter table public.hr_work_shifts
  drop constraint if exists hr_work_shifts_org_id_automation_id_fkey;
alter table public.hr_work_shifts
  add constraint hr_work_shifts_org_id_automation_id_fkey
  foreign key (org_id, automation_id) references public.hr_shift_automations(org_id, id);

comment on column public.hr_work_shifts.automation_id is
  'Automatização que gerou o turno (RH 2.0). Só referência: alterar/pausar a automatização não altera turnos existentes.';
