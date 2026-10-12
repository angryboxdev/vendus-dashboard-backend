-- Rollback de 20261017100000_novo_rh_time_bank.sql
-- O ledger do banco de horas é registo de auditoria: NÃO se apaga.
-- O rollback só retira a escrita; categorias e validações ficam para consulta.

revoke insert, update, delete on public.time_bank_entries, public.time_bank_validations, public.hour_categories from authenticated;
