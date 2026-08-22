-- Tipo de remuneração e valor por hora (para trabalhadores pagos à hora)
ALTER TABLE public.hr_employees
  ADD COLUMN IF NOT EXISTS salary_type text NOT NULL DEFAULT 'fixed'
    CHECK (salary_type IN ('fixed', 'hourly')),
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(8, 2);

COMMENT ON COLUMN public.hr_employees.salary_type  IS '"fixed" = salário fixo mensal; "hourly" = pago à hora';
COMMENT ON COLUMN public.hr_employees.hourly_rate  IS 'Valor por hora em EUR (só relevante quando salary_type = "hourly")';
