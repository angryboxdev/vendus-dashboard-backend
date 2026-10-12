-- Rollback de 20261014100000_novo_rh_time_base.sql
-- Antes: exportar horários, calendários e atribuições (as alterações ficam em
-- audit_events) e pôr no ar um backend sem o módulo time-base.
-- Perfis do domínio 'legal' (se existirem) têm de ser arquivados antes de repor a CHECK.

drop table if exists public.time_assignments;
drop table if exists public.vacation_calendars;
drop table if exists public.holiday_calendar_days;
drop table if exists public.holiday_calendars;
drop table if exists public.work_schedule_versions;
drop table if exists public.work_schedules;

alter table public.setting_profiles drop constraint if exists setting_profiles_domain_check;
alter table public.setting_profiles add constraint setting_profiles_domain_check
  check (domain in ('security', 'time_tracking', 'notifications'));
