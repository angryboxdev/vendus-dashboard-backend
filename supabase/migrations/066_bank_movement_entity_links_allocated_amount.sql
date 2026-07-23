-- Migration 066: allocated_amount_cents in bank_movement_entity_links
--
-- Previously, amount_cents stored the entity's total amount at the time of
-- reconciliation. This was used to compute the movement's amount diff.
--
-- With the new allocation model (1:N, N:1, N:M reconciliation), we need to
-- track how much of the movement was actually allocated to each entity, which
-- may be less than the entity's total (partial payment).
--
-- allocated_amount_cents: the portion of the movement's amount assigned to this
--   entity. Positive, non-zero, and must not exceed the entity's open balance.
--
-- amount_cents is kept for historical reference but is no longer used in
-- business logic. allocated_amount_cents is the authoritative value.

ALTER TABLE bank_movement_entity_links
  ADD COLUMN IF NOT EXISTS allocated_amount_cents INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows: treat the old amount_cents as the allocated amount.
UPDATE bank_movement_entity_links
  SET allocated_amount_cents = amount_cents
  WHERE allocated_amount_cents = 0 AND amount_cents > 0;

-- Add index to speed up open-balance queries (sum allocations by entity).
CREATE INDEX IF NOT EXISTS idx_bmel_entity
  ON bank_movement_entity_links (entity_type, entity_id);
