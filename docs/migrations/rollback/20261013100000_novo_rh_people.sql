-- Rollback de 20261013100000_novo_rh_people.sql
-- Antes: exportar contratos, responsáveis, complementos e campos
-- personalizados (as alterações ficam em audit_events, que não se apaga) e
-- pôr no ar um backend sem o módulo people. As colunas novas de
-- hr_employees ficam (são opcionais) — apagá-las perderia nome/apelido.

update public.access_profiles set permissions = permissions - 'hr.people_export' where system_key in ('admin', 'rh');

drop table if exists public.employee_custom_values;
drop table if exists public.custom_field_definitions;
drop table if exists public.employee_compensations;
drop table if exists public.compensation_items;
drop table if exists public.employee_managers;
drop trigger if exists employment_contracts_no_overlap on public.employment_contracts;
drop table if exists public.employment_contracts;
drop function if exists public.employment_contracts_no_overlap();
drop table if exists public.collective_agreements;

delete from public.employee_org_assignments where unit_type = 'location';
alter table public.employee_org_assignments drop constraint if exists employee_org_assignments_unit_type_check;
alter table public.employee_org_assignments add constraint employee_org_assignments_unit_type_check check (unit_type in ('department', 'group'));

drop index if exists public.hr_employees_org_nif_uq;
