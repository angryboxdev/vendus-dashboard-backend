-- Migration 073: Add document_url to recurring_contracts and recurring_occurrences
-- Supports RF09 — document uploads (contracts, invoice PDFs, salary sheets, payment proofs)

ALTER TABLE recurring_contracts
  ADD COLUMN IF NOT EXISTS document_url text;

ALTER TABLE recurring_occurrences
  ADD COLUMN IF NOT EXISTS document_url text;
