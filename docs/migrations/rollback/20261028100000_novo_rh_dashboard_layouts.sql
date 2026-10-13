-- Rollback de 20261028100000_novo_rh_dashboard_layouts.sql
-- Só preferências visuais (sem dados de negócio nem auditoria): apagar a tabela é seguro.
drop policy if exists "dashboard_layouts: org-scoped all" on public.dashboard_layouts;
drop table if exists public.dashboard_layouts;
