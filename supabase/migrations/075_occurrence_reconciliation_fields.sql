-- Migration 075: campos de reconciliação nas ocorrências + cost_center_category_id nos contratos
--
-- recurring_occurrences:
--   bank_transaction_id — FK para bank_movements (movimento bancário que confirmou o pagamento)
--   payment_id          — referência externa do pagamento (ex: referência SEPA, número de cheque)
--
-- recurring_contracts:
--   cost_center_category_id — FK para cost_center_categories (sub-categoria do centro de custo)

-- ── recurring_occurrences ──────────────────────────────────────────────────────

ALTER TABLE recurring_occurrences
  ADD COLUMN IF NOT EXISTS bank_transaction_id uuid REFERENCES bank_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_id text;

CREATE INDEX IF NOT EXISTS idx_recurring_occurrences_bank_tx
  ON recurring_occurrences(bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL;

-- ── recurring_contracts ────────────────────────────────────────────────────────

ALTER TABLE recurring_contracts
  ADD COLUMN IF NOT EXISTS cost_center_category_id uuid REFERENCES cost_center_categories(id) ON DELETE SET NULL;
