-- Migration 074: Align payment_method values with product spec
-- Old values: bank_transfer, direct_debit, mb, card, manual
-- New values: transfer, direct_debit, check, cash, card, mbway, other

-- Migrate existing rows to new values before changing the constraint
UPDATE recurring_contracts SET payment_method = 'transfer' WHERE payment_method = 'bank_transfer';
UPDATE recurring_contracts SET payment_method = 'other'    WHERE payment_method = 'mb';
UPDATE recurring_contracts SET payment_method = 'other'    WHERE payment_method = 'manual';

-- Drop old constraint and recreate with new allowed values
ALTER TABLE recurring_contracts
  DROP CONSTRAINT IF EXISTS recurring_contracts_payment_method_check,
  ADD CONSTRAINT recurring_contracts_payment_method_check
    CHECK (payment_method IN ('transfer', 'direct_debit', 'check', 'cash', 'card', 'mbway', 'other'));
