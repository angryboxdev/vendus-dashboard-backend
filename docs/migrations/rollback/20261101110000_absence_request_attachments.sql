-- Rollback de 20261101110000_absence_request_attachments.sql (perde a ligação
-- dos pedidos aos anexos carregados; os ficheiros ficam no bucket hr-documents
-- até serem apagados à mão). O backend que lê estas colunas tem de ser revertido antes.
alter table public.absence_requests drop column if exists attachment_path;
alter table public.absence_requests drop column if exists attachment_name;
alter table public.absence_requests drop column if exists attachment_mime;
