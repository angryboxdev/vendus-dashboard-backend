-- Migration 068: Add bank_account_id directly on bank_movements
-- Enables the new calendar paradigm: movements are primary, statements are audit artifacts.

ALTER TABLE bank_movements
  ADD COLUMN IF NOT EXISTS bank_account_id UUID
    REFERENCES bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bank_movements_account_date_idx
  ON bank_movements (bank_account_id, booking_date)
  WHERE bank_account_id IS NOT NULL;

-- Clean slate: delete all pre-existing imports and movements (pre-bank_accounts paradigm).
-- Movements are deleted via CASCADE from bank_statement_imports.
TRUNCATE TABLE bank_statement_imports CASCADE;
