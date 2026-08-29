import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface InvoiceReconciliationWritePort {
  /**
   * Marca a fatura como totalmente conciliada e, se ainda não estiver paga,
   * marca-a como paga com a data do movimento bancário.
   */
  markReconciled(organizationId: OrganizationId, invoiceId: string, movementDate: Date): Promise<void>;

  /**
   * Marca a fatura como parcialmente conciliada (tem links mas não cobre o total).
   */
  markPartiallyReconciled(organizationId: OrganizationId, invoiceId: string): Promise<void>;

  /**
   * Reverte para pending_reconciliation (links removidos ou total alocado = 0).
   * Não reverte o status de pagamento — uma fatura paga mantém-se paga.
   */
  markUnreconciled(organizationId: OrganizationId, invoiceId: string): Promise<void>;
}
