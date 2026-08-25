-- Migration 083: add 'justificado' to reconciliation_status check constraint on bank_movements.
-- 'justificado' is used when a movement is manually justified via the "Justificar despesa" tab
-- (recibo_comprovativo, contrato_recorrencia, despesa_bancaria_automatica, emprestimo_financiamento).
-- 'conciliado_sem_fatura' is kept for credit movements auto-resolved on import.

ALTER TABLE bank_movements
  DROP CONSTRAINT IF EXISTS bank_movements_reconciliation_status_check;

ALTER TABLE bank_movements
  ADD CONSTRAINT bank_movements_reconciliation_status_check
  CHECK (reconciliation_status IN (
    'conciliado_com_fatura',
    'conciliado_parcial',
    'conciliado_sem_fatura',
    'justificado',
    'sugestao',
    'pendente_de_documento',
    'saida_nao_justificada',
    'transferencia_interna',
    'divergente',
    'ignorado_com_motivo'
  ));
