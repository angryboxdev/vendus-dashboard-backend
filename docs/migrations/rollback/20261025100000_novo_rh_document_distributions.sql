-- Rollback de 20261025100000_novo_rh_document_distributions.sql
-- Atenção: apaga os envios e a prova de leitura. Exportar a prova antes, se for preciso.
-- Os ficheiros no bucket (prefixo {org_id}/distributions/) não são apagados por este script.
drop trigger if exists document_distribution_recipients_no_delete on public.document_distribution_recipients;
drop table if exists public.document_distribution_recipients;
drop table if exists public.document_distributions;
drop function if exists public.guard_document_distribution_recipients();
