-- Add 'recurrence_occurrence' to the matched_entity_type check constraint on bank_movements.
-- This value was already defined in the TypeScript domain but was missing from the DB constraint.

ALTER TABLE bank_movements
  DROP CONSTRAINT IF EXISTS bank_movements_matched_entity_type_check;

ALTER TABLE bank_movements
  ADD CONSTRAINT bank_movements_matched_entity_type_check
  CHECK (matched_entity_type IS NULL OR matched_entity_type IN (
    'invoice', 'payable_entry', 'receipt', 'internal_transfer', 'manual_entry',
    'recurrence_occurrence'
  ));
