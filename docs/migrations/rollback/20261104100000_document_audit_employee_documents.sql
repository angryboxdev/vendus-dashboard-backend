-- Rollback de 20261104100000_document_audit_employee_documents.sql.
-- Apaga a auditoria dos documentos de colaborador gravada desde então
-- (não há outro sítio para ela) e repõe o CHECK original.

delete from public.document_audit_logs where entity_type = 'employee_document';

alter table public.document_audit_logs
  drop constraint if exists document_audit_logs_entity_type_check;

alter table public.document_audit_logs
  add constraint document_audit_logs_entity_type_check
  check (entity_type in ('company_document', 'document_category'));
