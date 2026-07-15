-- Créditos não precisam de classificação manual neste MVP.
-- Atualiza movimentos de crédito que ainda estão "pendente_de_documento"
-- para "conciliado_sem_fatura" (auto-resolvido).
UPDATE bank_movements
SET
  reconciliation_status = 'conciliado_sem_fatura',
  requires_document     = false,
  updated_at            = now()
WHERE
  movement_type          = 'credit'
  AND reconciliation_status = 'pendente_de_documento';
