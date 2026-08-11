export interface InvoiceReconciliationWritePort {
  /**
   * Marca a fatura como totalmente conciliada e, se ainda não estiver paga,
   * marca-a como paga com a data do movimento bancário.
   */
  markReconciled(invoiceId: string, movementDate: Date): Promise<void>;

  /**
   * Marca a fatura como parcialmente conciliada (tem links mas não cobre o total).
   */
  markPartiallyReconciled(invoiceId: string): Promise<void>;

  /**
   * Reverte para pending_reconciliation (links removidos ou total alocado = 0).
   * Não reverte o status de pagamento — uma fatura paga mantém-se paga.
   */
  markUnreconciled(invoiceId: string): Promise<void>;
}
