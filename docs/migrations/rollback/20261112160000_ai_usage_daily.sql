-- Rollback de 20261112160000_ai_usage_daily.sql. Perde só a contagem de chamadas (sem orçamento
-- até voltar a aplicar); nenhum documento é afetado.
drop policy if exists "ai_usage_daily: org-scoped all" on public.ai_usage_daily;
drop table if exists public.ai_usage_daily;
