-- Rollback de 20261029100000_novo_rh_location_google_places.sql
-- Só a ligação local → lugar no Google (sem dados de negócio nem auditoria).
drop policy if exists "location_google_places: org-scoped all" on public.location_google_places;
drop table if exists public.location_google_places;
