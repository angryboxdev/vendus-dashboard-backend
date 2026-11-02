-- Rollback de 20261212100000_attendance_day_reviews.sql
-- Apaga as decisões de conferência. As picagens, revisões e dias gravados não são tocados;
-- depois do rollback, pedir o recálculo dos dias afetados para voltar aos valores das picagens.
drop policy if exists "attendance_day_reviews: org-scoped all" on public.attendance_day_reviews;
drop table if exists public.attendance_day_reviews;
