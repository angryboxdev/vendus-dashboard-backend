-- Rollback de 20261023100000_novo_rh_break_types.sql
-- As marcações mantêm-se (perdem só a indicação do tipo de pausa).
alter table public.clock_events drop constraint if exists clock_events_break_type_fk;
alter table public.clock_events drop column if exists break_type_id;
drop table if exists public.break_types;
