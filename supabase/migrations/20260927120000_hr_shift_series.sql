-- RH — "Criar e repetir turnos com padrão semanal". Extensão aditiva de
-- hr_work_shifts: turno repartido (2º segmento opcional), turno noturno
-- (atravessa a meia-noite, sem dividir em 2 linhas) e séries recorrentes
-- (series_id — tag partilhada, sem tabela pai; "editar/limpar toda a
-- série" é uma consulta por series_id). Relaxa a constraint de ordem
-- horária para permitir turnos noturnos; mantém-na para os restantes.

alter table public.hr_work_shifts
  add column if not exists series_id uuid,
  add column if not exists ends_next_day boolean not null default false,
  add column if not exists second_start_time time,
  add column if not exists second_end_time time;

alter table public.hr_work_shifts
  drop constraint if exists hr_work_shifts_time_order;

alter table public.hr_work_shifts
  add constraint hr_work_shifts_time_order check (
    ends_next_day or (start_time < end_time)
  );

-- 2º segmento (turno repartido) só suportado para turnos no mesmo dia civil
-- (não combinado com ends_next_day nesta V1 — dívida documentada no README).
alter table public.hr_work_shifts
  add constraint hr_work_shifts_second_segment_shape check (
    second_start_time is null
    or (
      not ends_next_day
      and second_end_time is not null
      and second_start_time < second_end_time
      and second_start_time >= end_time
    )
  );

create index hr_work_shifts_series_id_idx on public.hr_work_shifts (series_id) where series_id is not null;

comment on column public.hr_work_shifts.series_id is
  'Tag partilhada por todos os turnos criados numa mesma série recorrente (sem tabela pai). NULL = turno avulso/manual, ou já destacado da série por edição individual ("Somente este turno").';
comment on column public.hr_work_shifts.ends_next_day is
  'Turno noturno (ex: 22:00→06:00) — end_time refere-se ao dia seguinte a work_date. Nunca dividido em duas linhas.';
comment on column public.hr_work_shifts.second_start_time is
  'Início do 2º período de um turno repartido (ex: 12:00–16:00 / 19:00–23:00). NULL = turno direto (1 período).';
