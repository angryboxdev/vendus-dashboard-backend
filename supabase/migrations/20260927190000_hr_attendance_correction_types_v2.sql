-- Fase 2.1: substitui o conjunto de tipos de correção manual da
-- Conferência (Fase 2, mais granular: add_entry/add_exit/fix_entry/
-- fix_exit/confirm/observation) pelas 5 ações do mockup de resolução de
-- ocorrência. Já existem linhas reais gravadas com os valores antigos —
-- por isso remapeia os valores existentes ANTES de trocar o CHECK
-- constraint, nunca perde/quebra uma linha já gravada.
--
-- IMPORTANTE (correção depois de uma 1ª tentativa falhada em produção):
-- o CHECK constraint ANTIGO tem de ser removido ANTES do UPDATE — o
-- UPDATE já escreve os valores NOVOS ('fix_times'/'keep_as_is'), que o
-- constraint antigo não permite. A ordem errada (UPDATE antes do DROP)
-- fazia o próprio UPDATE falhar com "violates check constraint
-- hr_attendance_corrections_correction_type_check". Esta versão dropa
-- primeiro, atualiza depois, e só no fim recria o constraint com os
-- valores novos — assim a validação final cobre também linhas que já
-- possam ter sido escritas por engano com um valor fora do esperado.
--
-- Mapeamento (só troca o rótulo, nunca mexe em original_status/
-- corrected_status/actual_start_time/actual_end_time/reason/actor):
--   add_entry, add_exit, fix_entry, fix_exit -> fix_times   (corrigiam entrada OU saída; fix_times cobre ambas)
--   confirm, observation                     -> keep_as_is (não alteravam hr_shift_attendance, mesmo espírito de "manter como está")
--   mark_absence                             -> mark_absence (sem alteração)
--
-- Idempotente: pode ser corrida novamente sem efeito adicional (o DROP
-- usa IF EXISTS, os UPDATE não têm mais linhas antigas para remapear
-- depois da 1ª corrida, e o ADD CONSTRAINT falha alto se os dados ainda
-- não estiverem conformes, em vez de falhar silenciosamente).

alter table public.hr_attendance_corrections
  drop constraint if exists hr_attendance_corrections_correction_type_check;

update public.hr_attendance_corrections
  set correction_type = 'fix_times'
  where correction_type in ('add_entry', 'add_exit', 'fix_entry', 'fix_exit');

update public.hr_attendance_corrections
  set correction_type = 'keep_as_is'
  where correction_type in ('confirm', 'observation');

alter table public.hr_attendance_corrections
  add constraint hr_attendance_corrections_correction_type_check
  check (correction_type in (
    'keep_as_is', 'fix_times', 'justify_no_impact', 'mark_absence', 'remove_marking'
  ));
