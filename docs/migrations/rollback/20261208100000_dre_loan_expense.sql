-- Rollback de 20261208100000_dre_loan_expense.sql: apaga a despesa de empréstimos e a renda variável dos
-- parâmetros do mês.

alter table public.dre_monthly_parameters
  drop constraint if exists dre_monthly_parameters_rent_check;
alter table public.dre_monthly_parameters
  drop constraint if exists dre_monthly_parameters_loan_expense_check;

alter table public.dre_monthly_parameters
  drop column if exists rent_variable_pct;
alter table public.dre_monthly_parameters
  drop column if exists rent_threshold_cents;
alter table public.dre_monthly_parameters
  drop column if exists loan_expense_cents;
