-- Conciliação bancária V2 (F2): extratos importados a partir de PDF (Millennium BCP «Extrato Combinado»).
-- Acrescenta 'pdf' aos valores permitidos de bank_statement_imports.source_type. Idempotente.
-- Rollback: docs/migrations/rollback/20261126100000_bank_statement_source_pdf.sql

alter table public.bank_statement_imports
  drop constraint if exists bank_statement_imports_source_type_check;

alter table public.bank_statement_imports
  add constraint bank_statement_imports_source_type_check
    check (source_type in ('csv', 'xlsx', 'manual', 'pdf'));
