-- Task "Simplificar Assiduidade em Conferência + Fecho Mensal", secção 18:
-- "criar snapshot do período" ao fechar — protege os números consolidados
-- de recomputações futuras (ex: mudança de regra de tolerância) enquanto
-- o período estiver fechado. Aditiva, nullable — nenhuma linha existente
-- é alterada além de ganhar `snapshot = null`.

alter table public.hr_monthly_closures
  add column if not exists snapshot jsonb;

comment on column public.hr_monthly_closures.snapshot is
  'Foto do resumo mensal por colaborador (MonthlyAttendanceSummaryResult) no momento exato do fecho — null enquanto o período nunca foi fechado.';
