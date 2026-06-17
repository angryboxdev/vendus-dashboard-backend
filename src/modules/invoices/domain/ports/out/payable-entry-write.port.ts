/**
 * Output port para criação/actualização de contas a pagar a partir do módulo invoices.
 * Declarado aqui para manter independência — o adapter concreto acede
 * directamente à tabela payable_entries via Supabase, sem importar código
 * do módulo payable-entries.
 */
export interface PayableEntryWritePort {
  /**
   * Cria uma entrada de conta a pagar ligada a esta fatura.
   * Chamado automaticamente quando uma fatura é criada com dueDate.
   * Não cria se já existir uma entrada com o mesmo invoiceId.
   */
  createForInvoice(data: {
    invoiceId: string;
    supplierId: string | null;
    supplierName: string;
    invoiceNumber: string;
    dueDate: Date;
    amount: number; // cents — totalWithVat da fatura
  }): Promise<void>;

  /** Marca como pago o payable ligado a esta fatura, se existir. */
  markPaidByInvoiceId(invoiceId: string, paidAt: Date): Promise<void>;

  /** Cancela o payable ligado a esta fatura, se existir e não estiver pago. */
  cancelByInvoiceId(invoiceId: string): Promise<void>;
}
