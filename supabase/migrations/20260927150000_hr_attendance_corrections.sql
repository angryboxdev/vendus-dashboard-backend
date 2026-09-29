-- Fase 2 (Assiduidade/Correções): trilha estruturada de correções manuais
-- de presença — original + corrigido + responsável + motivo, sempre
-- pesquisável (ao contrário do par payload_before/payload_after em JSON
-- já usado por hr_audit_logs). hr_shift_attendance continua a ser a
-- tabela "efetiva"; esta é só o ledger de auditoria ao lado. Aditiva, não
-- destrutiva — nenhuma tabela existente é alterada aqui.

create table public.hr_attendance_corrections (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id),
  work_shift_id           uuid references public.hr_work_shifts(id) on delete cascade,
  employee_id             uuid not null references public.hr_employees(id),
  work_date               date not null,
  correction_type         text not null
    check (correction_type in (
      'add_entry', 'add_exit', 'fix_entry', 'fix_exit',
      'mark_absence', 'confirm', 'observation'
    )),
  original_status         text,
  original_start_time     time,
  original_end_time       time,
  corrected_status        text,
  corrected_start_time    time,
  corrected_end_time      time,
  reason                  text not null,
  notes                   text,
  actor                   text not null,
  created_at              timestamptz not null default now()
);

comment on table public.hr_attendance_corrections is
  'Trilha estruturada de correções manuais de assiduidade (Fase 2) — hr_shift_attendance guarda só o estado atual, esta tabela nunca é editada, apenas acrescentada.';

create index hr_attendance_corrections_org_id_idx on public.hr_attendance_corrections (org_id);
create index hr_attendance_corrections_employee_id_idx on public.hr_attendance_corrections (employee_id, work_date);
create index hr_attendance_corrections_work_shift_id_idx on public.hr_attendance_corrections (work_shift_id);

alter table public.hr_attendance_corrections enable row level security;
