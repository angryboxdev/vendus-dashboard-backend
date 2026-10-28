-- «Controle geral» (.scratch/controle-geral/spec.md, fase 2), nos parâmetros do mês:
--  - despesa de empréstimos (DE), lançada à mão — prestações de empréstimos fora da operação que não
--    passam pelo banco;
--  - renda variável: % da faturação do mês acima de um limite (ex.: 8% acima de 19 000 €).
-- Nada disto entra na DRE. Idempotente.
-- Rollback: docs/migrations/rollback/20261208100000_dre_loan_expense.sql

alter table public.dre_monthly_parameters
  add column if not exists loan_expense_cents bigint not null default 0;
alter table public.dre_monthly_parameters
  add column if not exists rent_threshold_cents bigint not null default 0;
alter table public.dre_monthly_parameters
  add column if not exists rent_variable_pct numeric(5,2) not null default 0;

alter table public.dre_monthly_parameters
  drop constraint if exists dre_monthly_parameters_loan_expense_check;
alter table public.dre_monthly_parameters
  add constraint dre_monthly_parameters_loan_expense_check check (loan_expense_cents >= 0);

alter table public.dre_monthly_parameters
  drop constraint if exists dre_monthly_parameters_rent_check;
alter table public.dre_monthly_parameters
  add constraint dre_monthly_parameters_rent_check check (rent_threshold_cents >= 0 and rent_variable_pct between 0 and 100);
