-- Rollback de 20261102100000_novo_rh_work_areas.sql
-- Retira a área dos turnos (os turnos ficam «Sem área») e as áreas de trabalho.
-- Ordem: se 20261103100000_novo_rh_coverage_rules já foi aplicada, desfazer essa primeiro
-- (coverage_rules aponta para work_areas).
-- Atenção: perde a área escolhida em cada turno; o `areaId` dentro do JSONB `published` fica (é ignorado).
drop index if exists public.roster_shifts_area_idx;
alter table public.roster_shifts drop constraint if exists roster_shifts_area_fk;
alter table public.roster_shifts drop column if exists area_id;
drop policy if exists "work_areas: org-scoped all" on public.work_areas;
drop table if exists public.work_areas;
