-- Migration 064: bank_movement_entity_links
-- Stores the individual entity links for a bank movement reconciliation.
-- Enables multi-entity reconciliation (linking 2+ invoices/payable entries to one movement).

CREATE TABLE IF NOT EXISTS bank_movement_entity_links (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id       UUID        NOT NULL REFERENCES bank_movements(id) ON DELETE CASCADE,
  entity_type       TEXT        NOT NULL CHECK (entity_type IN ('invoice', 'payable_entry')),
  entity_id         UUID        NOT NULL,
  amount_cents      INTEGER     NOT NULL,
  entity_label      TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (movement_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_bmei_movement_id ON bank_movement_entity_links (movement_id);
