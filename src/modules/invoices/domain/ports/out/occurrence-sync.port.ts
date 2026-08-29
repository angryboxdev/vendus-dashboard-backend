import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Output port para sincronização de ocorrências recorrentes a partir do módulo invoices.
 * Declarado aqui para manter independência — o adapter concreto acede
 * directamente à tabela recurring_occurrences via Supabase, sem importar código
 * do módulo payable-recurrences.
 */
export interface OccurrenceSyncPort {
  /** Marca como paga a ocorrência vinculada a esta fatura, se existir e não estiver já paga/reconciliada/cancelada. */
  markPaidByInvoiceId(organizationId: OrganizationId, invoiceId: string, paidAt: Date): Promise<void>;
}
