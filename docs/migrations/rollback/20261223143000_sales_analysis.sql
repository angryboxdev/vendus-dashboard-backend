-- Rollback de 20261223143000_sales_analysis.sql: apaga a cache da Análise de Vendas e retira a permissão.
-- A cache volta a encher-se sozinha (Vendus) ou a pedido (AirMenu) se a migração for reaplicada.
drop table if exists public.sales_analysis_buckets;
drop table if exists public.sales_analysis_days;
update public.access_profiles set permissions = permissions - 'sales.analysis', version = version + 1, updated_at = now() where permissions ? 'sales.analysis';
update public.org_members set permission_overrides = permission_overrides - 'sales.analysis' where permission_overrides ? 'sales.analysis';
