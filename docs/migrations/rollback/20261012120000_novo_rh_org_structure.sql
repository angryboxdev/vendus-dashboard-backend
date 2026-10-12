-- Rollback de 20261012120000_novo_rh_org_structure.sql
-- Antes de correr: exportar departamentos, grupos, pertenças e contactos
-- (os eventos destas alterações ficam em audit_events, que não se apaga).
-- org_terms_acceptances é registo legal: NÃO se apaga — só se desliga a escrita.

alter table public.locations drop constraint if exists locations_geofence_radius_range_ck;

drop table if exists public.employee_org_assignments;
drop trigger if exists org_groups_no_cycle on public.org_groups;
drop table if exists public.org_groups;
drop table if exists public.org_departments;
drop table if exists public.org_contacts;
drop function if exists public.org_groups_no_cycle();

revoke insert on public.org_terms_acceptances from authenticated;

update public.access_profiles set permissions = permissions - 'company.structure' where system_key in ('admin', 'manager', 'rh', 'financeiro');
