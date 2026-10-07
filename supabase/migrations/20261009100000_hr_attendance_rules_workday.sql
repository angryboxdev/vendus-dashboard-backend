-- Jornada (1 turno / 1,5 / dupla) — limites configuráveis em
-- RH → Assiduidade → Configurar regras. Aditiva: colunas novas com valor
-- por omissão (8h, 1h30 de tolerância de fecho, dupla a partir de 12h);
-- as versões já existentes ficam com estes valores.

alter table public.hr_attendance_rules
  add column if not exists standard_shift_minutes integer not null default 480 check (standard_shift_minutes > 0),
  add column if not exists closing_tolerance_minutes integer not null default 90 check (closing_tolerance_minutes >= 0),
  add column if not exists double_shift_from_minutes integer not null default 720 check (double_shift_from_minutes > 0);
