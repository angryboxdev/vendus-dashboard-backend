-- ADR-0040, fase 1: os documentos de colaborador saem do RH antigo para o
-- módulo `documents` e passam a ser auditados em `document_audit_logs`
-- (antes: `hr_audit_logs`). Só alarga o CHECK de `entity_type`.
-- Idempotente. Rollback: docs/migrations/rollback/20261104100000_document_audit_employee_documents.sql

alter table public.document_audit_logs
  drop constraint if exists document_audit_logs_entity_type_check;

alter table public.document_audit_logs
  add constraint document_audit_logs_entity_type_check
  check (entity_type in ('company_document', 'document_category', 'employee_document'));
