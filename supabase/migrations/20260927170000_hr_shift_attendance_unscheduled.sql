-- Fase 2 (Conferência): permite "Presença sem escala" — hoje é
-- estruturalmente impossível ter uma linha de presença sem turno
-- (work_shift_id era not null unique, e o kiosk do colaborador rejeita
-- check-in sem turno agendado, 404 "Não tens turno agendado para hoje").
-- A única fonte real de presença sem escala é o GESTOR a registar
-- manualmente uma entrada/saída para um (colaborador, dia) sem turno —
-- esta migração só relaxa a restrição para tornar isso representável,
-- nunca cria nenhuma escala automaticamente.

alter table public.hr_shift_attendance
  alter column work_shift_id drop not null;

alter table public.hr_shift_attendance
  drop constraint if exists hr_shift_attendance_work_shift_id_key;

create unique index if not exists hr_shift_attendance_work_shift_id_key
  on public.hr_shift_attendance (work_shift_id)
  where work_shift_id is not null;

alter table public.hr_shift_attendance
  add column if not exists employee_id uuid references public.hr_employees(id),
  add column if not exists work_date date;

alter table public.hr_shift_attendance
  drop constraint if exists hr_shift_attendance_shift_or_standalone;
alter table public.hr_shift_attendance
  add constraint hr_shift_attendance_shift_or_standalone check (
    work_shift_id is not null
    or (employee_id is not null and work_date is not null)
  );

comment on column public.hr_shift_attendance.employee_id is
  'Só preenchido quando work_shift_id é NULL (presença sem escala) — quando há turno, o colaborador já vem de lá, nunca duplicado.';
comment on column public.hr_shift_attendance.work_date is
  'Idem — só preenchido para presença sem escala.';
