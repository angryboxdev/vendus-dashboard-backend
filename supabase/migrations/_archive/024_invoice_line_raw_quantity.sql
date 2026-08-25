-- Guarda a quantidade original da fatura (antes de aplicar o factor de conversão
-- do mapping). Permite recalcular corretamente o quantity_per_invoice_unit
-- ao confirmar, sem corromper o factor em imports subsequentes.
ALTER TABLE supplier_invoice_import_lines
  ADD COLUMN IF NOT EXISTS raw_invoice_quantity numeric(14,3);
