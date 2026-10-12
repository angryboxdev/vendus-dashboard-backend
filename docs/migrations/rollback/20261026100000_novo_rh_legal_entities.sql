-- Rollback de 20261026100000_novo_rh_legal_entities.sql
-- Atenção: apaga as entidades legais e a ligação aos centros. Exportar antes, se for preciso.
drop table if exists public.legal_entity_locations;
drop trigger if exists legal_entities_no_delete on public.legal_entities;
drop table if exists public.legal_entities;
drop function if exists public.guard_legal_entities_delete();
