-- «Controle geral» (.scratch/controle-geral/spec.md, fase 2): despesa de empréstimos do mês (DE), lançada
-- à mão nos parâmetros do mês — prestações de empréstimos fora da operação que não passam pelo banco.
-- Não entra na DRE. Idempotente.
-- Rollback: docs/migrations/rollback/20261208100000_dre_loan_expense.sql

alter table public.dre_monthly_parameters
  add column if not exists loan_expense_cents bigint not null default 0;

alter table public.dre_monthly_parameters
  drop constraint if exists dre_monthly_parameters_loan_expense_check;

alter table public.dre_monthly_parameters
  add constraint dre_monthly_parameters_loan_expense_check check (loan_expense_cents >= 0);
