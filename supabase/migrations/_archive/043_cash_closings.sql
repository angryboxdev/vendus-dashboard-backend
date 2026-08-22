CREATE TABLE cash_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_date date NOT NULL,
  employee_id uuid NOT NULL REFERENCES hr_employees(id),
  tpa numeric(10,2) NOT NULL DEFAULT 0,
  uber numeric(10,2) NOT NULL DEFAULT 0,
  glovo numeric(10,2) NOT NULL DEFAULT 0,
  bolt numeric(10,2) NOT NULL DEFAULT 0,
  eatz numeric(10,2) NOT NULL DEFAULT 0,
  cash_sales numeric(10,2) NOT NULL DEFAULT 0,
  total_calculated numeric(10,2) NOT NULL,
  vendus_total numeric(10,2),
  sangria_amount numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  manager_notes text,
  reviewed_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cash_closings_closing_date_idx ON cash_closings(closing_date);
CREATE INDEX cash_closings_employee_id_idx ON cash_closings(employee_id);
CREATE INDEX cash_closings_status_idx ON cash_closings(status);
