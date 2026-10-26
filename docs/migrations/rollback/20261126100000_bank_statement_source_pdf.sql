-- Rollback de 20261126100000_bank_statement_source_pdf.sql
-- Só é possível sem extratos importados de PDF: confirmar antes que não há nenhum
--   select count(*) from public.bank_statement_imports where source_type = 'pdf';
-- (se houver, apagar/reclassificar esses extratos primeiro — decisão do utilizador).

alter table public.bank_statement_imports
  drop constraint if exists bank_statement_imports_source_type_check;

alter table public.bank_statement_imports
  add constraint bank_statement_imports_source_type_check
    check (source_type in ('csv', 'xlsx', 'manual'));
