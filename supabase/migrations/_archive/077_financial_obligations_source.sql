-- Migration 077: source e payment_method em payable_entries
--
-- source: distingue a origem de cada conta a pagar
--   'invoice'    — criada automaticamente ao importar/criar uma fatura (visível no ecrã Faturas)
--   'recurrence' — criada ao confirmar uma ocorrência de recorrência
--   'manual'     — criada directamente pelo utilizador sem fatura nem recorrência
--
-- A nova tela "Obrigações Financeiras" filtra source IN ('recurrence', 'manual').
-- Payables com source='invoice' continuam visíveis apenas no ecrã de Faturas.
--
-- payment_method: método de pagamento registado quando a obrigação é marcada como paga.

-- ── source ────────────────────────────────────────────────────────────────────

ALTER TABLE payable_entries
  ADD COLUMN IF NOT EXISTS source TEXT
    CHECK (source IN ('invoice', 'recurrence', 'manual'));

-- Backfill: faturas primeiro (invoice_id IS NOT NULL)
UPDATE payable_entries pe
SET source = 'invoice'
WHERE pe.invoice_id IS NOT NULL;

-- Backfill: recorrências (existe ocorrência vinculada)
UPDATE payable_entries pe
SET source = 'recurrence'
WHERE pe.source IS NULL
  AND EXISTS (
    SELECT 1 FROM recurring_occurrences ro
    WHERE ro.payable_entry_id = pe.id
  );

-- Backfill: tudo o resto → manual
UPDATE payable_entries pe
SET source = 'manual'
WHERE pe.source IS NULL;

-- NOT NULL + DEFAULT para novos registos sem source explícito
ALTER TABLE payable_entries
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN source SET DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_payable_entries_source ON payable_entries(source);

-- ── payment_method ────────────────────────────────────────────────────────────

ALTER TABLE payable_entries
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (payment_method IN ('transfer', 'direct_debit', 'check', 'cash', 'card', 'mbway', 'other'));
