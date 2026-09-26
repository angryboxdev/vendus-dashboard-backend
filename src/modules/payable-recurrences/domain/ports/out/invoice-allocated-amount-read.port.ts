import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Output port — cross-module read access to how much of an invoice has
 * actually been reconciled at the bank (bank_movement_entity_links,
 * owned by bank-statements). Used for occurrences linked to an invoice
 * (fluxo A, spec Task_Recorrencias_Conciliacao_AngryBox.md §3.A): "Pago" for
 * those occurrences is whatever the bank has actually allocated to the
 * invoice, not the invoice's own status — this also naturally covers a
 * partially-reconciled invoice.
 *
 * The adapter reads bank_movement_entity_links directly via Supabase without
 * importing any code from the bank-statements module (D10).
 */
export interface InvoiceAllocatedAmountReadPort {
  /** Sum of allocated_amount_cents per invoiceId (entity_type='invoice'). Invoices with no allocation are absent from the map (never zero-valued). */
  findAllocatedAmounts(organizationId: OrganizationId, invoiceIds: string[]): Promise<Map<string, number>>;
}
