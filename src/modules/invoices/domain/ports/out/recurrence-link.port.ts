import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Cross-módulo (payable-recurrences): associar a fatura lançada à ocorrência da
 * recorrência correspondente e, ao apagar a fatura, desfazer essa associação.
 * Declarado aqui para as faturas não dependerem do módulo de recorrências.
 */
export interface RecurrenceLinkPort {
  autoLinkInvoice(organizationId: OrganizationId, invoiceId: string): Promise<void>;
  /** `paymentGroupId`: documento de pagamento da fatura apagada (lido antes de apagar), ou null. */
  releaseInvoice(organizationId: OrganizationId, invoiceId: string, paymentGroupId: string | null): Promise<void>;
}
