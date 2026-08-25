-- Add 'xlsx' to the allowed values for bank_statement_imports.source_type

ALTER TABLE bank_statement_imports
  DROP CONSTRAINT bank_statement_imports_source_type_check;

ALTER TABLE bank_statement_imports
  ADD CONSTRAINT bank_statement_imports_source_type_check
    CHECK (source_type IN ('csv', 'xlsx', 'manual'));
