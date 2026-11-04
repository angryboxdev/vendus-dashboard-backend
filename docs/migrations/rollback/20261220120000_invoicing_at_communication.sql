-- Rollback de 20261220120000_invoicing_at_communication.sql (F6 — comunicação à AT).
-- Atenção: apaga o registo das comunicações à AT e as credenciais WFA guardadas.
-- O registo é imutável por trigger: retira-se o trigger antes de largar a tabela.

drop function if exists public.fn_invoicing_at_queue(uuid, text, integer);

drop trigger if exists invoicing_at_communications_immutable on public.invoicing_at_communications;
drop trigger if exists invoicing_at_communications_no_truncate on public.invoicing_at_communications;
drop table if exists public.invoicing_at_communications;

drop table if exists public.invoicing_at_credentials;
