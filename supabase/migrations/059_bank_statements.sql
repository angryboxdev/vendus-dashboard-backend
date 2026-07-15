-- Migration 059: Bank Statements (Conciliação Bancária)
-- Tables: bank_statement_imports, bank_movements, bank_reconciliation_rules

-- ── bank_statement_imports ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bank_statement_imports (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name                   TEXT        NOT NULL,
  account_number              TEXT        NOT NULL,
  period_start                DATE        NOT NULL,
  period_end                  DATE        NOT NULL,
  currency                    TEXT        NOT NULL DEFAULT 'EUR',
  source_type                 TEXT        NOT NULL
    CHECK (source_type IN ('csv', 'manual')),
  source_file_name            TEXT,
  imported_movements_count    INTEGER     NOT NULL DEFAULT 0,
  opening_balance             INTEGER     NOT NULL DEFAULT 0,  -- cents
  closing_balance             INTEGER     NOT NULL DEFAULT 0,  -- cents (from statement)
  calculated_closing_balance  INTEGER     NOT NULL DEFAULT 0,  -- cents (computed)
  balance_difference          INTEGER     NOT NULL DEFAULT 0,  -- cents (calculated - closing)
  reconciliation_progress     NUMERIC(5,2) NOT NULL DEFAULT 0, -- 0–100
  status                      TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'completed', 'closed')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bank_statement_imports_account_idx
  ON bank_statement_imports (account_number);

CREATE INDEX IF NOT EXISTS bank_statement_imports_period_idx
  ON bank_statement_imports (period_start, period_end);

-- ── bank_movements ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bank_movements (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_import_id   UUID        NOT NULL
    REFERENCES bank_statement_imports (id) ON DELETE CASCADE,
  booking_date          DATE        NOT NULL,
  value_date            DATE        NOT NULL,
  description           TEXT        NOT NULL,
  amount                INTEGER     NOT NULL, -- cents, absolute value (always >= 0)
  balance_after         INTEGER     NOT NULL, -- cents
  currency              TEXT        NOT NULL DEFAULT 'EUR',
  movement_type         TEXT        NOT NULL
    CHECK (movement_type IN ('debit', 'credit')),
  reconciliation_status TEXT        NOT NULL DEFAULT 'saida_nao_justificada'
    CHECK (reconciliation_status IN (
      'conciliado_com_fatura',
      'conciliado_sem_fatura',
      'sugestao',
      'pendente_de_documento',
      'saida_nao_justificada',
      'transferencia_interna',
      'divergente',
      'ignorado_com_motivo'
    )),
  justification_type    TEXT
    CHECK (justification_type IS NULL OR justification_type IN (
      'fatura',
      'recibo_comprovativo',
      'contrato_recorrencia',
      'despesa_bancaria_automatica',
      'transferencia_interna',
      'emprestimo_financiamento',
      'sem_justificativa'
    )),
  risk_level            TEXT        NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  requires_document     BOOLEAN     NOT NULL DEFAULT TRUE,
  document_url          TEXT,
  matched_entity_type   TEXT
    CHECK (matched_entity_type IS NULL OR matched_entity_type IN (
      'invoice', 'payable_entry', 'receipt', 'internal_transfer', 'manual_entry'
    )),
  matched_entity_id     UUID,
  confidence_score      NUMERIC(3,2)
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  notes                 TEXT,
  deduplication_hash    TEXT        NOT NULL UNIQUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bank_movements_statement_idx
  ON bank_movements (statement_import_id);

CREATE INDEX IF NOT EXISTS bank_movements_status_idx
  ON bank_movements (reconciliation_status);

CREATE INDEX IF NOT EXISTS bank_movements_booking_date_idx
  ON bank_movements (booking_date);

CREATE INDEX IF NOT EXISTS bank_movements_risk_idx
  ON bank_movements (risk_level);

-- ── bank_reconciliation_rules ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bank_reconciliation_rules (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT        NOT NULL,
  description_contains    TEXT        NOT NULL,
  movement_type           TEXT
    CHECK (movement_type IS NULL OR movement_type IN ('debit', 'credit')),
  -- Optional links to cost center hierarchy (no FK constraint — applied when tables exist)
  cost_center_group_id    UUID,
  cost_center_category_id UUID,
  justification_type      TEXT        NOT NULL
    CHECK (justification_type IN (
      'fatura',
      'recibo_comprovativo',
      'contrato_recorrencia',
      'despesa_bancaria_automatica',
      'transferencia_interna',
      'emprestimo_financiamento',
      'sem_justificativa'
    )),
  requires_document       BOOLEAN     NOT NULL DEFAULT FALSE,
  affects_dre             BOOLEAN     NOT NULL DEFAULT TRUE,
  affects_cashflow        BOOLEAN     NOT NULL DEFAULT TRUE,
  affects_profitability   BOOLEAN     NOT NULL DEFAULT FALSE,
  risk_level              TEXT        NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  is_active               BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed common Portuguese bank rules
INSERT INTO bank_reconciliation_rules
  (name, description_contains, movement_type, justification_type, requires_document, affects_dre, affects_cashflow, affects_profitability, risk_level)
VALUES
  ('Comissão manutenção conta',  'COM.MAN.CONTA',    'debit',  'despesa_bancaria_automatica', FALSE, TRUE,  TRUE,  FALSE, 'low'),
  ('Imposto do selo',            'IMPOSTO DO SELO',  'debit',  'despesa_bancaria_automatica', FALSE, TRUE,  TRUE,  FALSE, 'low'),
  ('Transferência interna',      'TRANSFERENCIA INT', NULL,    'transferencia_interna',       FALSE, FALSE, TRUE,  FALSE, 'low'),
  ('Pagamento MB Way',           'MBWAY',            'debit',  'recibo_comprovativo',         TRUE,  TRUE,  TRUE,  FALSE, 'medium'),
  ('Recebimento Stripe',         'STRIPE',           'credit', 'recibo_comprovativo',         FALSE, TRUE,  TRUE,  FALSE, 'low'),
  ('Comissão internacional',     'COM.SERV.INTERN',  'debit',  'despesa_bancaria_automatica', FALSE, TRUE,  TRUE,  FALSE, 'low')
ON CONFLICT DO NOTHING;
