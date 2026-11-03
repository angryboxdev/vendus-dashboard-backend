-- Rollback de 20261220100000_invoicing_certified_documents.sql
-- ATENÇÃO: apaga documentos fiscais. Só é admissível enquanto não houver
-- documentos reais (antes da certificação só existem documentos de formação).
-- Depois de haver faturação real, os registos têm de ser conservados 10 anos
-- (DL 28/2019, art. 19.º) — não correr este rollback.

drop function if exists public.invoicing_cancel_document(uuid, uuid, text, text);
drop function if exists public.invoicing_issue_document(uuid, uuid, integer, text, jsonb, jsonb, jsonb, text);

drop table if exists public.invoicing_events;
drop table if exists public.invoicing_document_taxes;
drop table if exists public.invoicing_document_lines;
drop table if exists public.invoicing_documents;
drop table if exists public.invoicing_series;

drop function if exists public.invoicing_series_guard();
drop function if exists public.invoicing_documents_guard();
drop function if exists public.invoicing_forbid_changes();
drop function if exists public.invoicing_insert_only_via_rpc();
drop function if exists public.invoicing_in_rpc();
