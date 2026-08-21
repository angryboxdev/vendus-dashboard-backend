-- Migration 078: pagamento direto em ocorrências de recorrências
--
-- Remove o conceito de "criar conta a pagar" a partir de ocorrências.
-- As ocorrências passam a ter paid_at + payment_method diretamente.
-- O fluxo deixa de ser: occurrence → payable_entry → paid
-- Passa a ser:           occurrence → paid  (direto)

-- Adicionar colunas de pagamento direto
ALTER TABLE recurring_occurrences
  ADD COLUMN IF NOT EXISTS paid_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_method  TEXT
    CHECK (payment_method IN ('transfer', 'direct_debit', 'check', 'cash', 'card', 'mbway', 'other'));

-- Retrocompatibilidade: ocorrências com status 'payable_created' ainda não estão pagas —
-- voltam a 'forecast' para serem pagas diretamente no novo fluxo.
UPDATE recurring_occurrences
SET status = 'forecast'
WHERE status = 'payable_created';

-- Atualizar a CHECK constraint de status (remover 'payable_created')
ALTER TABLE recurring_occurrences
  DROP CONSTRAINT IF EXISTS recurring_occurrences_status_check;

ALTER TABLE recurring_occurrences
  ADD CONSTRAINT recurring_occurrences_status_check
  CHECK (status IN ('forecast', 'awaiting_invoice', 'invoice_linked', 'paid', 'reconciled', 'cancelled'));

-- Índices úteis para pesquisa na conciliação bancária
CREATE INDEX IF NOT EXISTS idx_recurring_occurrences_paid_at
  ON recurring_occurrences(paid_at)
  WHERE paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_occurrences_unpaid
  ON recurring_occurrences(status)
  WHERE status IN ('forecast', 'awaiting_invoice', 'invoice_linked');
