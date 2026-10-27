import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Pagamento de faturas pela conciliação (módulo invoices, via adapter): a fatura conciliada por inteiro
 * fica paga e a conta a pagar e a ocorrência ligadas acompanham; quando deixa de estar conciliada por
 * inteiro, o pagamento que a conciliação fez é desfeito (um pagamento marcado à mão nunca é).
 */
export interface InvoicePaymentPort {
  settle(
    organizationId: OrganizationId,
    input: { invoiceId: string; paidAt: string; bankAccountId: string | null; paidByThisReconciliation: boolean },
  ): Promise<void>;
  reopen(organizationId: OrganizationId, invoiceId: string): Promise<void>;
}
