-- Rollback de 20261209100000_bank_rule_classify_only.sql: as regras voltam todas a justificar.

alter table public.bank_reconciliation_rules
  drop column if exists classify_only;
