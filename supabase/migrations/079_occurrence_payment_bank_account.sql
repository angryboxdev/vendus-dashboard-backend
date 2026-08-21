-- Migration 079: campos de pagamento adicionais em ocorrências
--
-- Adiciona conta bancária e notas de pagamento ao registo de pagamento direto,
-- em paridade com o modal de pagamento de faturas.

ALTER TABLE recurring_occurrences
  ADD COLUMN IF NOT EXISTS payment_bank_account_id UUID REFERENCES bank_accounts(id),
  ADD COLUMN IF NOT EXISTS payment_notes           TEXT;

COMMENT ON COLUMN recurring_occurrences.payment_bank_account_id IS
  'Conta bancária debitada no pagamento (preenchida ao marcar como pago)';
COMMENT ON COLUMN recurring_occurrences.payment_notes IS
  'Observação livre sobre o pagamento (ex: "via homebanking")';
