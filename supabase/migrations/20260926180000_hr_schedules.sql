-- RH-03 (Escalas & Turnos) — extensão aditiva de hr_work_shifts, mais duas
-- tabelas novas: escala base (modelo semanal por colaborador) e turnos
-- rotativos (alternância automática entre 2 colaboradores da mesma
-- função). Nada aqui apaga/renomeia colunas existentes — a leitura legacy
-- de hr_work_shifts/hr_shift_attendance (src/services/hrShiftService.ts,
-- src/pages/hr/HrCalendarPage.tsx) continua a funcionar sem alterações.

-- ── hr_shift_rotations (criada antes, para a FK de hr_work_shifts) ─────────

create table public.hr_shift_rotations (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id),
  job_role              text not null check (job_role in ('manager', 'prep', 'service')),
  -- Exactamente 2 participantes no MVP (task RH-03: "MVP: 2 colaboradores +
  -- Turno A / Turno B; arquitetura extensível para mais participantes") —
  -- sem FK direta por elemento (mesma simplificação já usada em
  -- hr_document_categories.job_roles), validado na aplicação.
  participant_employee_ids uuid[] not null,
  pattern_a_start_time  time not null,
  pattern_a_end_time    time not null,
  pattern_b_start_time  time not null,
  pattern_b_end_time    time not null,
  location_id           uuid not null,
  -- Segunda-feira da semana 1, onde participant_employee_ids[1] começa no
  -- padrão A e participant_employee_ids[2] no padrão B; alternam a cada
  -- semana a partir daqui.
  anchor_date           date not null,
  auto_switch_weekly    boolean not null default true,
  active                boolean not null default true,
  created_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint hr_shift_rotations_participants_count check (array_length(participant_employee_ids, 1) = 2),
  constraint hr_shift_rotations_pattern_a_order check (pattern_a_start_time < pattern_a_end_time),
  constraint hr_shift_rotations_pattern_b_order check (pattern_b_start_time < pattern_b_end_time)
);

create index hr_shift_rotations_org_id_idx on public.hr_shift_rotations (org_id);

alter table public.hr_shift_rotations enable row level security;

-- ── hr_work_shifts: campos novos ───────────────────────────────────────────

alter table public.hr_work_shifts
  add column if not exists status text not null default 'published'
    check (status in ('draft', 'published')),
  add column if not exists break_minutes integer not null default 0,
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'base_schedule', 'rotation')),
  add column if not exists rotation_id uuid references public.hr_shift_rotations(id) on delete set null;

comment on column public.hr_work_shifts.status is
  'draft = ainda não publicado ao colaborador (RH-03); published = visível/confirmado. Turnos já existentes antes da RH-03 ficam published por omissão.';
comment on column public.hr_work_shifts.source is
  'Proveniência do turno — manual (criado/editado à mão, protegido contra reaplicação silenciosa de escala base/rotação), base_schedule (gerado por aplicar escala base), rotation (gerado por uma rotação ativa).';

create index hr_work_shifts_status_idx on public.hr_work_shifts (status);
create index hr_work_shifts_rotation_id_idx on public.hr_work_shifts (rotation_id) where rotation_id is not null;

-- ── hr_base_schedule_templates ──────────────────────────────────────────────

create table public.hr_base_schedule_templates (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  employee_id    uuid not null,
  -- 0 = Segunda .. 6 = Domingo (mesma convenção da grelha semanal do mockup).
  weekday        smallint not null check (weekday between 0 and 6),
  is_day_off     boolean not null default false,
  start_time     time,
  end_time       time,
  location_id    uuid,
  break_minutes  integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint hr_base_schedule_templates_org_employee_weekday_key unique (org_id, employee_id, weekday),
  constraint hr_base_schedule_templates_time_shape check (
    (is_day_off and start_time is null and end_time is null)
    or (not is_day_off and start_time is not null and end_time is not null and start_time < end_time)
  )
);

create index hr_base_schedule_templates_org_employee_idx
  on public.hr_base_schedule_templates (org_id, employee_id);

alter table public.hr_base_schedule_templates
  add constraint hr_base_schedule_templates_org_id_employee_id_fkey
  foreign key (org_id, employee_id) references public.hr_employees (org_id, id);

alter table public.hr_base_schedule_templates enable row level security;
