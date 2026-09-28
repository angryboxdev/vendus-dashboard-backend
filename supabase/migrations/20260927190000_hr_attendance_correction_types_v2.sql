-- Fase 2.1: substitui o conjunto de tipos de correção manual da
-- Conferência (Fase 2, mais granular: add_entry/add_exit/fix_entry/
-- fix_exit/confirm/observation) pelas 5 ações do mockup de resolução de
-- ocorrência. AO CONTRÁRIO do que a 1ª versão desta migração assumia,
-- já existem linhas reais gravadas com os valores antigos (confirmado
-- pelo utilizador, que já testou o fluxo de correção em produção) — por
-- isso remapeia os valores existentes ANTES de trocar o CHECK
-- constraint, nunca perde/quebra uma linha já gravada.
--
-- Mapeamento (só troca o rótulo, nunca mexe em original_status/
-- corrected_status/actual_start_time/actual_end_time/reason/actor):
--   add_entry, add_exit, fix_entry, fix_exit -> fix_times   (corrigiam entrada OU saída; fix_times cobre ambas)
--   confirm, observation                     -> keep_as_is (não alteravam hr_shift_attendance, mesmo espírito de "manter como está")
--   mark_absence                             -> mark_absence (sem alteração)

update public.hr_attendance_corrections
  set correction_type = 'fix_times'
  where correction_type in ('add_entry', 'add_exit', 'fix_entry', 'fix_exit');

update public.hr_attendance_corrections
  set correction_type = 'keep_as_is'
  where correction_type in ('confirm', 'observation');

alter table public.hr_attendance_corrections
  drop constraint if exists hr_attendance_corrections_correction_type_check;

alter table public.hr_attendance_corrections
  add constraint hr_attendance_corrections_correction_type_check
  check (correction_type in (
    'keep_as_is', 'fix_times', 'justify_no_impact', 'mark_absence', 'remove_marking'
  ));
