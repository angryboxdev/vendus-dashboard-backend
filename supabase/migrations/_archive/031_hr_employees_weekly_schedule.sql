-- Esqueleto de escala semanal (JSON camelCase: days[].weekday 0=Seg … 6=Dom, segments[].startTime/endTime).

alter table public.hr_employees
  add column if not exists weekly_schedule jsonb;

comment on column public.hr_employees.weekly_schedule is
  'Escala semanal recorrente (hora local loja). Null = nunca definido.';
