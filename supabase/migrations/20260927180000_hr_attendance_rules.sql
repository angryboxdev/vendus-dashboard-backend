-- Fase 2.1 (Regras de Assiduidade, Tolerâncias e Conferência): regras
-- configuráveis de tolerância/janela, globais à organização (sem regras
-- por colaborador/função/local nesta fase — task, secção 3). Cada
-- alteração insere uma NOVA linha (nunca UPDATE) com os 5 valores
-- completos + vigência — nunca reescreve silenciosamente o histórico
-- (task, secção 4). "Vigente" = linha com effective_from mais recente
-- que já tenha começado, resolvido em runtime pelo domínio
-- (attendance-tolerance.service.ts), não por uma flag "is_current" aqui
-- (evita ter de mexer numa linha antiga sempre que uma nova é criada).
--
-- `control_start_date` (task "Assiduidade — Conferência, Por Colaborador
-- e Horas & Saldos", secção 11): turnos anteriores a esta data nunca
-- geram pendência automática por tolerância (ausência de marcação) —
-- só suprime a deteção automática, nunca um sinal manual já existente.
-- `null` = sem limite (comportamento anterior, controla desde sempre).

create table public.hr_attendance_rules (
  id                            uuid primary key default gen_random_uuid(),
  org_id                        uuid not null references public.organizations(id),
  entry_tolerance_minutes       integer not null check (entry_tolerance_minutes >= 0),
  early_exit_tolerance_minutes  integer not null check (early_exit_tolerance_minutes >= 0),
  absence_threshold_minutes     integer not null check (absence_threshold_minutes >= 0),
  pre_shift_window_minutes      integer not null check (pre_shift_window_minutes >= 0),
  post_shift_window_minutes     integer not null check (post_shift_window_minutes >= 0),
  control_start_date            date,
  effective_from                date not null,
  changed_by                    text not null,
  created_at                    timestamptz not null default now()
);

comment on table public.hr_attendance_rules is
  'Regras de assiduidade (Fase 2.1) — cada linha é uma versão completa (nunca editada depois de criada); a vigente é resolvida em runtime, nunca por flag.';

create index hr_attendance_rules_org_id_idx on public.hr_attendance_rules (org_id);
create index hr_attendance_rules_org_id_effective_from_idx on public.hr_attendance_rules (org_id, effective_from desc);

alter table public.hr_attendance_rules enable row level security;
