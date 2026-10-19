-- Rollback de 20261103100000_novo_rh_coverage_rules.sql
-- Apaga as regras do Plano de Cobertura (os turnos e as áreas não são tocados).
drop policy if exists "coverage_rules: org-scoped all" on public.coverage_rules;
drop table if exists public.coverage_rules;
