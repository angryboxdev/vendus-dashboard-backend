-- ============================================================
-- 036 — Férias, Ausências e Feriados
-- ============================================================

-- ------------------------------------------------------------
-- Feriados públicos
-- ------------------------------------------------------------
CREATE TABLE public.hr_public_holidays (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  date       date    NOT NULL UNIQUE,
  name       text    NOT NULL,
  is_national boolean NOT NULL DEFAULT true
);

CREATE INDEX hr_public_holidays_date_idx ON public.hr_public_holidays (date);

-- Pré-carregar feriados nacionais portugueses 2024–2027
-- Fixos (10)
INSERT INTO public.hr_public_holidays (date, name) VALUES
  -- 2024
  ('2024-01-01', 'Ano Novo'),
  ('2024-04-25', 'Dia da Liberdade'),
  ('2024-05-01', 'Dia do Trabalhador'),
  ('2024-06-10', 'Dia de Portugal, de Camões e das Comunidades Portuguesas'),
  ('2024-08-15', 'Assunção de Nossa Senhora'),
  ('2024-10-05', 'Implantação da República'),
  ('2024-11-01', 'Dia de Todos os Santos'),
  ('2024-12-01', 'Restauração da Independência'),
  ('2024-12-08', 'Imaculada Conceição'),
  ('2024-12-25', 'Natal'),
  -- 2024 móveis (Páscoa = 31 Mar)
  ('2024-03-29', 'Sexta-feira Santa'),
  ('2024-03-31', 'Domingo de Páscoa'),
  ('2024-05-30', 'Corpo de Deus'),

  -- 2025
  ('2025-01-01', 'Ano Novo'),
  ('2025-04-25', 'Dia da Liberdade'),
  ('2025-05-01', 'Dia do Trabalhador'),
  ('2025-06-10', 'Dia de Portugal, de Camões e das Comunidades Portuguesas'),
  ('2025-08-15', 'Assunção de Nossa Senhora'),
  ('2025-10-05', 'Implantação da República'),
  ('2025-11-01', 'Dia de Todos os Santos'),
  ('2025-12-01', 'Restauração da Independência'),
  ('2025-12-08', 'Imaculada Conceição'),
  ('2025-12-25', 'Natal'),
  -- 2025 móveis (Páscoa = 20 Abr)
  ('2025-04-18', 'Sexta-feira Santa'),
  ('2025-04-20', 'Domingo de Páscoa'),
  ('2025-06-19', 'Corpo de Deus'),

  -- 2026
  ('2026-01-01', 'Ano Novo'),
  ('2026-04-25', 'Dia da Liberdade'),
  ('2026-05-01', 'Dia do Trabalhador'),
  ('2026-06-10', 'Dia de Portugal, de Camões e das Comunidades Portuguesas'),
  ('2026-08-15', 'Assunção de Nossa Senhora'),
  ('2026-10-05', 'Implantação da República'),
  ('2026-11-01', 'Dia de Todos os Santos'),
  ('2026-12-01', 'Restauração da Independência'),
  ('2026-12-08', 'Imaculada Conceição'),
  ('2026-12-25', 'Natal'),
  -- 2026 móveis (Páscoa = 5 Abr)
  ('2026-04-03', 'Sexta-feira Santa'),
  ('2026-04-05', 'Domingo de Páscoa'),
  ('2026-06-04', 'Corpo de Deus'),

  -- 2027
  ('2027-01-01', 'Ano Novo'),
  ('2027-04-25', 'Dia da Liberdade'),
  ('2027-05-01', 'Dia do Trabalhador'),
  ('2027-06-10', 'Dia de Portugal, de Camões e das Comunidades Portuguesas'),
  ('2027-08-15', 'Assunção de Nossa Senhora'),
  ('2027-10-05', 'Implantação da República'),
  ('2027-11-01', 'Dia de Todos os Santos'),
  ('2027-12-01', 'Restauração da Independência'),
  ('2027-12-08', 'Imaculada Conceição'),
  ('2027-12-25', 'Natal'),
  -- 2027 móveis (Páscoa = 28 Mar)
  ('2027-03-26', 'Sexta-feira Santa'),
  ('2027-03-28', 'Domingo de Páscoa'),
  ('2027-05-27', 'Corpo de Deus');

-- ------------------------------------------------------------
-- Pedidos de ausência / férias
-- ------------------------------------------------------------
CREATE TABLE public.hr_leave_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  text NOT NULL,
  type         text NOT NULL CHECK (type IN ('vacation', 'sick_leave', 'justified', 'unjustified')),
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  working_days integer NOT NULL DEFAULT 0,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_leave_dates_check CHECK (end_date >= start_date)
);

CREATE INDEX hr_leave_requests_employee_idx ON public.hr_leave_requests (employee_id);
CREATE INDEX hr_leave_requests_dates_idx    ON public.hr_leave_requests (start_date, end_date);

-- ------------------------------------------------------------
-- Saldo anual de férias por funcionário
-- ------------------------------------------------------------
CREATE TABLE public.hr_leave_balances (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       text    NOT NULL,
  year              integer NOT NULL,
  days_entitled     integer NOT NULL DEFAULT 22,
  days_carried_over integer NOT NULL DEFAULT 0,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, year)
);

CREATE INDEX hr_leave_balances_employee_idx ON public.hr_leave_balances (employee_id);
