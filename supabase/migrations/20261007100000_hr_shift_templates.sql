-- RH 2.0 — ticket 01 "Modelos de turno" (.scratch/rh-2-0).
--
-- 1) `hr_shift_templates`: horário reutilizável (Direto/Repartido, também
--    noturno), local padrão opcional, Ativo/Inativo. Nunca apagado — só
--    inativado. Mesma forma de horários de `hr_work_shifts`
--    (20260927120000_hr_shift_series.sql): repartido nunca combinado com
--    "termina no dia seguinte". Nome único por organização (sem distinguir
--    maiúsculas/espaços), como os Cargos.
--
-- 2) `hr_work_shifts` ganha a origem: `template_id` (e, no ticket 03,
--    `automation_id`) e `source` passa a aceitar 'template'/'automation'.
--    O horário/local continuam copiados no próprio turno (snapshot) —
--    alterar o modelo nunca altera turnos já criados (spec T1).
--
-- Aditivo e reexecutável.

create table if not exists public.hr_shift_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null check (length(btrim(name)) > 0),
  normalized_name text generated always as (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) stored,
  description text,
  color text,
  start_time time not null,
  end_time time not null,
  ends_next_day boolean not null default false,
  second_start_time time,
  second_end_time time,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  location_id uuid,
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_shift_templates_org_id_id_key unique (org_id, id),
  constraint hr_shift_templates_org_id_normalized_name_key unique (org_id, normalized_name),
  constraint hr_shift_templates_org_id_location_id_fkey
    foreign key (org_id, location_id) references public.locations(org_id, id),
  constraint hr_shift_templates_time_shape check (
    (second_start_time is null) = (second_end_time is null)
    and (ends_next_day or start_time < end_time)
    and (second_start_time is null or (not ends_next_day and second_start_time >= end_time and second_start_time < second_end_time))
  )
);

create index if not exists hr_shift_templates_org_id_idx on public.hr_shift_templates (org_id);

alter table public.hr_shift_templates enable row level security;

drop policy if exists "hr_shift_templates: org-scoped all" on public.hr_shift_templates;
create policy "hr_shift_templates: org-scoped all"
  on public.hr_shift_templates
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- ── Origem do turno ──────────────────────────────────────────────────────

alter table public.hr_work_shifts
  add column if not exists template_id uuid;

alter table public.hr_work_shifts
  drop constraint if exists hr_work_shifts_org_id_template_id_fkey;
alter table public.hr_work_shifts
  add constraint hr_work_shifts_org_id_template_id_fkey
  foreign key (org_id, template_id) references public.hr_shift_templates(org_id, id);

alter table public.hr_work_shifts
  drop constraint if exists hr_work_shifts_source_check;
alter table public.hr_work_shifts
  add constraint hr_work_shifts_source_check
  check (source in ('manual', 'base_schedule', 'rotation', 'template', 'automation'));

comment on column public.hr_work_shifts.template_id is
  'Modelo de turno de origem (RH 2.0). Só referência: o horário/local do turno são cópia (snapshot) e não mudam se o modelo mudar.';
