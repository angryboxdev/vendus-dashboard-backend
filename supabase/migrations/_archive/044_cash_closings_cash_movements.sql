ALTER TABLE cash_closings
  ADD COLUMN cash_in numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN cash_out numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN cash_drawer_open numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN cash_drawer_total numeric(10,2) NOT NULL DEFAULT 0;

-- Recalculate sangria_amount based on cash_drawer_total for existing rows
UPDATE cash_closings
  SET sangria_amount = GREATEST(cash_drawer_total - 100, 0);
