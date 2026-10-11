-- Rollback de 20261015100000_novo_rh_attendance.sql
-- Marcações, revisões e ajustes são registos de origem/auditoria: NÃO se
-- apagam (task §4.6.7). O rollback só desliga a escrita (backend anterior
-- não usa estas tabelas) e remove a fila e os dias apurados (recalculáveis).

drop table if exists public.attendance_recalc_queue;
drop table if exists public.attendance_days;
revoke insert, update on public.clock_events, public.clock_revisions, public.clock_correction_requests, public.attendance_adjustments, public.attendance_incidents from authenticated;
