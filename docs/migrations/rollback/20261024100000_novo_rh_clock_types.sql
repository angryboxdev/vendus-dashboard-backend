-- Rollback de 20261024100000_novo_rh_clock_types.sql
-- As marcações mantêm-se (perdem só a indicação do tipo de registo).
alter table public.clock_events drop constraint if exists clock_events_clock_type_fk;
alter table public.clock_events drop column if exists clock_type_id;
drop table if exists public.clock_types;
