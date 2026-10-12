-- Rollback de 20261012100000_novo_rh_settings_engine.sql
-- ATENÇÃO: apaga o histórico de configurações do Novo RH. Antes de correr,
-- exportar setting_values (CSV em Novo RH → Configurações → Histórico) e
-- guardar a cópia. Não há dados legados afetados (tabelas novas).

drop trigger if exists setting_values_append_only on public.setting_values;
drop trigger if exists setting_profile_targets_guard on public.setting_profile_targets;
drop table if exists public.setting_values;
drop table if exists public.setting_profile_targets;
drop table if exists public.setting_profiles;
drop table if exists public.http_idempotency_keys;
drop function if exists public.forbid_setting_value_changes();
drop function if exists public.guard_setting_target_changes();

update public.access_profiles
   set permissions = permissions - 'governance.settings' - 'governance.audit' - 'governance.settings_retroactive'
 where system_key = 'admin';
