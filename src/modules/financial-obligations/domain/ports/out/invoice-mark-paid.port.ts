/**
 * Cross-module output port — quando uma obrigação com invoiceId é marcada como
 * paga, sincroniza o estado da fatura correspondente.
 *
 * O adapter concreto acede directamente à tabela invoices sem importar código
 * do módulo invoices.
 */
export interface InvoiceMarkPaidPort {
  markPaid(invoiceId: string, paidAt: Date): Promise<void>;
}
