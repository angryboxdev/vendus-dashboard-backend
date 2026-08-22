-- Migration 062: Add classification fields to bank_movements
-- Adds cost center, supplier, and VAT info collected during manual classification.

ALTER TABLE bank_movements
  ADD COLUMN IF NOT EXISTS cost_center_group_id    UUID REFERENCES cost_center_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_center_category_id UUID REFERENCES cost_center_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_id             UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vat_rate                DECIMAL(5,2),   -- percentage e.g. 23.00; NULL = not applicable
  ADD COLUMN IF NOT EXISTS vat_included            BOOLEAN;        -- TRUE = amount already includes VAT; NULL = not applicable
