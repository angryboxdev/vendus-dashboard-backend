-- Rollback de 20261020100000_novo_rh_communication.sql
-- Comunicados (versões e recibos) e alertas são registos de auditoria: NÃO se apagam.
-- O rollback só retira a escrita.

revoke insert, update, delete on public.announcements, public.announcement_versions, public.announcement_recipients, public.announcement_receipts,
  public.alert_rules, public.alerts, public.custom_request_forms, public.custom_requests, public.ops_tasks from authenticated;
