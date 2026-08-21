-- Migration 072: módulo payable-recurrences
--
-- Cria duas tabelas:
--   recurring_contracts  — regra permanente / contrato (a "Recorrência")
--   recurring_occurrences — instância mensal da recorrência
--
-- Separação intencional: o contrato nunca se converte em fatura.
-- O que se converte/vincula é a ocorrência mensal.

-- ─── recurring_contracts ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recurring_contracts (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text        NOT NULL,
  supplier_id             uuid        REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name           text        NOT NULL,
  type                    text        NOT NULL
    CHECK (type IN ('fixed_contract', 'variable_invoice', 'recurring_service', 'payroll', 'bank_auto', 'fiscal')),
  frequency               text        NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('monthly', 'quarterly', 'annual')),
  cost_center_id          uuid        REFERENCES cost_center_groups(id) ON DELETE SET NULL,
  category                text,
  estimated_amount_cents  int         NOT NULL CHECK (estimated_amount_cents > 0),
  day_of_month            smallint    NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  start_date              date        NOT NULL,
  end_date                date,
  payment_method          text        NOT NULL
    CHECK (payment_method IN ('bank_transfer', 'direct_debit', 'mb', 'card', 'manual')),
  auto_create_payable     boolean     NOT NULL DEFAULT false,
  require_invoice         boolean     NOT NULL DEFAULT false,
  status                  text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'closed')),
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT end_date_after_start CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_recurring_contracts_status ON recurring_contracts(status);
CREATE INDEX IF NOT EXISTS idx_recurring_contracts_supplier ON recurring_contracts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_recurring_contracts_type ON recurring_contracts(type);

-- ─── recurring_occurrences ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recurring_occurrences (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recurrence_id           uuid        NOT NULL REFERENCES recurring_contracts(id) ON DELETE CASCADE,
  -- YYYY-MM string — identifies the month this occurrence belongs to
  period                  char(7)     NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
  estimated_amount_cents  int         NOT NULL CHECK (estimated_amount_cents > 0),
  real_amount_cents       int         CHECK (real_amount_cents IS NULL OR real_amount_cents > 0),
  due_date                date        NOT NULL,
  status                  text        NOT NULL DEFAULT 'forecast'
    CHECK (status IN ('forecast', 'awaiting_invoice', 'invoice_linked', 'payable_created', 'paid', 'reconciled', 'cancelled')),
  require_invoice         boolean     NOT NULL DEFAULT false,
  invoice_id              uuid        REFERENCES invoices(id) ON DELETE SET NULL,
  payable_entry_id        uuid        REFERENCES payable_entries(id) ON DELETE SET NULL,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- Each recurrence can only have one occurrence per period
  CONSTRAINT uq_recurrence_period UNIQUE (recurrence_id, period)
);

CREATE INDEX IF NOT EXISTS idx_recurring_occurrences_recurrence ON recurring_occurrences(recurrence_id);
CREATE INDEX IF NOT EXISTS idx_recurring_occurrences_period ON recurring_occurrences(period);
CREATE INDEX IF NOT EXISTS idx_recurring_occurrences_status ON recurring_occurrences(status);
CREATE INDEX IF NOT EXISTS idx_recurring_occurrences_due_date ON recurring_occurrences(due_date);
