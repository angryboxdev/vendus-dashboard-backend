-- Salário base no perfil do funcionário
ALTER TABLE public.hr_employees
  ADD COLUMN IF NOT EXISTS base_salary numeric(10, 2);

-- Período de referência do salário e estado de pagamento
ALTER TABLE public.hr_employee_payments
  ADD COLUMN IF NOT EXISTS salary_period_year  smallint,
  ADD COLUMN IF NOT EXISTS salary_period_month smallint,
  ADD COLUMN IF NOT EXISTS is_paid             boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hr_employees.base_salary IS 'Salário base mensal em EUR (optional)';
COMMENT ON COLUMN public.hr_employee_payments.salary_period_year  IS 'Ano civil de referência (só para salários)';
COMMENT ON COLUMN public.hr_employee_payments.salary_period_month IS 'Mês de referência 1–12 (só para salários)';
COMMENT ON COLUMN public.hr_employee_payments.is_paid             IS 'True quando o pagamento foi efectivamente transferido';
