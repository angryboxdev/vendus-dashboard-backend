-- Rollback de 20261202100000_recurrence_bank_rules.sql
-- As regras perdem a ligação à recorrência (continuam a classificar, sem pagar ocorrências) e as recorrências
-- voltam a referir-se sempre ao mês do pagamento. Ocorrências já pagas e movimentos já ligados ficam como estão.
-- Fazer antes o rollback do código (a API escreve estas colunas).

drop index if exists public.idx_bank_reconciliation_rules_org_id_recurrence_id;

alter table public.bank_reconciliation_rules
  drop constraint if exists bank_reconciliation_rules_org_id_recurrence_id_fkey;

alter table public.bank_reconciliation_rules
  drop column if exists recurrence_id;

alter table public.recurring_contracts
  drop constraint if exists recurring_contracts_payment_period_offset_check;

alter table public.recurring_contracts
  drop column if exists payment_period_offset;
