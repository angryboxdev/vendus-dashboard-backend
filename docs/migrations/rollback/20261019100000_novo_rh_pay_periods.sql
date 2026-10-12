-- Rollback de 20261019100000_novo_rh_pay_periods.sql
-- Fechos e reaberturas são registos de auditoria: NÃO se apagam.
-- O rollback só retira a escrita; as exportações (ficheiros temporários) podem ser removidas.

revoke insert, update, delete on public.pay_periods, public.pay_period_closures, public.pay_period_reopenings from authenticated;
drop table if exists public.export_jobs;
