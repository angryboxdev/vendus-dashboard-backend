-- Turnos rotativos — suporte a turno repartido nos Padrões A/B (mesmo
-- modelo já usado em hr_work_shifts: 2º segmento opcional, nunca sobreposto
-- ao 1º). Extensão aditiva de hr_shift_rotations.

alter table public.hr_shift_rotations
  add column if not exists pattern_a_second_start_time time,
  add column if not exists pattern_a_second_end_time time,
  add column if not exists pattern_b_second_start_time time,
  add column if not exists pattern_b_second_end_time time;

alter table public.hr_shift_rotations
  drop constraint if exists hr_shift_rotations_pattern_a_second_segment_shape;
alter table public.hr_shift_rotations
  add constraint hr_shift_rotations_pattern_a_second_segment_shape check (
    pattern_a_second_start_time is null
    or (
      pattern_a_second_end_time is not null
      and pattern_a_second_start_time < pattern_a_second_end_time
      and pattern_a_second_start_time >= pattern_a_end_time
    )
  );

alter table public.hr_shift_rotations
  drop constraint if exists hr_shift_rotations_pattern_b_second_segment_shape;
alter table public.hr_shift_rotations
  add constraint hr_shift_rotations_pattern_b_second_segment_shape check (
    pattern_b_second_start_time is null
    or (
      pattern_b_second_end_time is not null
      and pattern_b_second_start_time < pattern_b_second_end_time
      and pattern_b_second_start_time >= pattern_b_end_time
    )
  );

comment on column public.hr_shift_rotations.pattern_a_second_start_time is
  'Início do 2º período do Turno A (turno repartido) — NULL = turno direto (1 período).';
comment on column public.hr_shift_rotations.pattern_b_second_start_time is
  'Início do 2º período do Turno B (turno repartido) — NULL = turno direto (1 período).';
