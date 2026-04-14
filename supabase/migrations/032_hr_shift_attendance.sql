-- Conferência: planeado (hr_work_shifts) vs realizado (1:1 por turno).

create table public.hr_shift_attendance (
  id                         uuid primary key default gen_random_uuid(),
  work_shift_id              uuid not null unique
    references public.hr_work_shifts (id) on delete cascade,
  status                     text not null
    check (status in (
      'worked_as_planned',
      'late',
      'left_early',
      'absent_justified',
      'absent_unjustified',
      'cancelled'
    )),
  actual_start_time          time,
  actual_end_time            time,
  late_minutes               integer,
  absence_reason             text,
  notes                      text,
  registration_source        text not null default 'dashboard'
    check (registration_source in ('dashboard', 'employee_qr', 'import')),
  registered_by_employee_id  uuid references public.hr_employees (id) on delete set null,
  registered_at              timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint hr_shift_attendance_actual_order check (
    actual_start_time is null
    or actual_end_time is null
    or actual_start_time < actual_end_time
  )
);

comment on table public.hr_shift_attendance is
  'Execução real vs turno planeado; ausência de linha = conferência pendente no cliente.';

create index if not exists idx_hr_shift_attendance_work_shift_id
  on public.hr_shift_attendance (work_shift_id);

alter table public.hr_shift_attendance enable row level security;
