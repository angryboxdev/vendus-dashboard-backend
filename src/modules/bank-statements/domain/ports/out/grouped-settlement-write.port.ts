import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { ReconciliationStatus } from "../../entities/bank-movement.js";

export interface GroupedSettlementLinkInput {
  entityId: string;
  documentType: "invoice" | "credit_note";
  /** Signed cents: positive for invoices, negative for credit notes. */
  allocatedAmountCents: number;
  /** Open balance the caller observed when building the selection (signed, same convention). */
  expectedOpenBalanceCents: number;
}

export interface GroupedSettlementWriteResult {
  reconciliationStatus: ReconciliationStatus;
}

/**
 * Output port for the atomic "Liquidação agrupada" write. A single call
 * settles a movement against N documents (invoices and/or credit notes),
 * with every document's true current open balance re-validated inside the
 * same DB transaction the write happens in (`fn_reconcile_movement_grouped`).
 *
 * Deliberately separate from `BankMovementEntityLinkRepositoryPort` — that
 * port is a set of individual CRUD-ish operations the use case composes
 * itself (no transaction, no revalidation); this port is one call that is
 * the transaction, needed precisely because PostgREST gives no multi-table
 * ad-hoc transaction (see the module README and `ScopedQuery`'s own doc
 * comment for the RPC convention this follows).
 */
export interface GroupedSettlementWritePort {
  confirm(
    organizationId: OrganizationId,
    movementId: string,
    links: GroupedSettlementLinkInput[]
  ): Promise<GroupedSettlementWriteResult>;
}
