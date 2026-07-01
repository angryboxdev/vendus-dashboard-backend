-- Migration: Add direct debit fields to invoices
-- Apply with: supabase db push or run directly in Supabase SQL editor

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS is_direct_debit BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS direct_debit_date DATE;

-- Index for the cron job that queries pending direct debits
CREATE INDEX IF NOT EXISTS idx_invoices_pending_direct_debits
  ON invoices (is_direct_debit, direct_debit_date)
  WHERE is_direct_debit = true AND status NOT IN ('paid', 'cancelled');
