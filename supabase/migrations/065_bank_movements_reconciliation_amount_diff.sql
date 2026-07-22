-- Migration 065: add reconciliation_amount_diff + conciliado_parcial status to bank_movements
-- reconciliation_amount_diff: difference (cents) between movement amount and sum of linked
--   entity amounts. NULL = not applicable. Positive = excess; negative = shortfall.
-- conciliado_parcial: new status for multi-entity reconciliations where amounts don't fully match.

ALTER TABLE bank_movements
  ADD COLUMN IF NOT EXISTS reconciliation_amount_diff INTEGER DEFAULT NULL;

-- Drop the old check constraint and recreate it with the new status value.
ALTER TABLE bank_movements
  DROP CONSTRAINT IF EXISTS bank_movements_reconciliation_status_check;

ALTER TABLE bank_movements
  ADD CONSTRAINT bank_movements_reconciliation_status_check
  CHECK (reconciliation_status IN (
    'conciliado_com_fatura',
    'conciliado_parcial',
    'conciliado_sem_fatura',
    'sugestao',
    'pendente_de_documento',
    'saida_nao_justificada',
    'transferencia_interna',
    'divergente',
    'ignorado_com_motivo'
  ));
