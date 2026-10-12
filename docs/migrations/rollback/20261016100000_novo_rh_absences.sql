-- Rollback de 20261016100000_novo_rh_absences.sql
-- Saldos e decisões são registos de auditoria: NÃO se apagam (task §4.6.7).
-- O rollback só retira a escrita e a permissão especial dos perfis.

revoke insert, update, delete on public.absence_types, public.approval_flows, public.absence_requests, public.approval_decisions, public.leave_balance_entries from authenticated;
update public.access_profiles set permissions = permissions - 'hr.absences_private', version = version + 1, updated_at = now() where system_key in ('admin', 'rh');
