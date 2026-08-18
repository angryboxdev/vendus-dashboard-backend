/**
 * Output port para limpeza de vínculos de reconciliação bancária
 * associados a uma fatura eliminada.
 * Declarado aqui para manter o módulo invoices independente do
 * módulo bank-statements — o adapter concreto acede directamente
 * à tabela bank_movement_entity_links via Supabase.
 */
export interface InvoiceReconciliationCleanupPort {
  /**
   * Remove todos os entity links do tipo "invoice" para o invoiceId dado
   * e actualiza o estado de conciliação dos movimentos afectados.
   * Chamado antes de eliminar a fatura para que movimentos bancários
   * não fiquem com referências a faturas inexistentes.
   */
  removeLinksForInvoice(invoiceId: string): Promise<void>;

  /**
   * Actualiza o entity_label dos links do tipo "invoice" para o invoiceId dado
   * quando o número da fatura muda.
   */
  renumberLinksForInvoice(invoiceId: string, newLabel: string): Promise<void>;
}
