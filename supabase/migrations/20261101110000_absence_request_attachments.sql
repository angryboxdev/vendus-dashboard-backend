-- Novo RH → Ausências: anexo carregado pelo colaborador no próprio pedido
-- (Portal ligado ao Novo RH, ticket 04 — ex.: justificar uma falta).
-- O ficheiro fica no bucket privado `hr-documents`, num caminho do próprio
-- colaborador (`{org}/absence-attachments/{employee}/…`); o servidor só aceita
-- caminhos dessa pasta. Só colunas novas (nulas por omissão); idempotente.
-- Rollback em docs/migrations/rollback/.

alter table public.absence_requests add column if not exists attachment_path text;
alter table public.absence_requests add column if not exists attachment_name text;
alter table public.absence_requests add column if not exists attachment_mime text;
