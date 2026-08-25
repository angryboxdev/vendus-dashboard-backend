-- Migrate invoice_lines and classification_rules to reference the new
-- cost_center_categories table instead of the old flat cost_centers table.
--
-- Strategy: add the new nullable column alongside the old one.
-- The old cost_center_id column is kept to avoid breaking existing data.

ALTER TABLE invoice_lines
  ADD COLUMN IF NOT EXISTS cost_center_category_id uuid REFERENCES cost_center_categories(id);

ALTER TABLE classification_rules
  ADD COLUMN IF NOT EXISTS default_cost_center_category_id uuid REFERENCES cost_center_categories(id);
