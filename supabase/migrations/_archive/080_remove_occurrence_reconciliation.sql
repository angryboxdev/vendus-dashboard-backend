-- Migration 080: Remove reconciliation fields from recurring_occurrences
-- Reconciliation is handled in the dedicated reconciliation screen, not here.

-- Update CHECK constraint to remove 'reconciled' status
ALTER TABLE recurring_occurrences
  DROP CONSTRAINT IF EXISTS recurring_occurrences_status_check;

ALTER TABLE recurring_occurrences
  ADD CONSTRAINT recurring_occurrences_status_check
  CHECK (status IN ('forecast', 'awaiting_invoice', 'invoice_linked', 'paid', 'cancelled'));

-- Update any existing 'reconciled' rows to 'paid' (they were already paid)
UPDATE recurring_occurrences SET status = 'paid' WHERE status = 'reconciled';

-- Drop the reconciliation columns
ALTER TABLE recurring_occurrences
  DROP COLUMN IF EXISTS bank_transaction_id,
  DROP COLUMN IF EXISTS payment_id;
