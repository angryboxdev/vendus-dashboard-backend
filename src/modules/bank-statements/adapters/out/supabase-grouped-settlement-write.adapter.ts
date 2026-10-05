import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { MovementNotFoundError, StaleDocumentBalanceError } from "../../domain/errors.js";
import type { ReconciliationStatus } from "../../domain/entities/bank-movement.js";
import type {
  GroupedSettlementLinkInput,
  GroupedSettlementWritePort,
  GroupedSettlementWriteResult,
} from "../../domain/ports/out/grouped-settlement-write.port.js";

/**
 * Adapter for the atomic "Liquidação agrupada" RPC
 * (`fn_reconcile_movement_grouped` — see the migration and `ScopedQuery`'s
 * `confirmGroupedSettlement` for the call convention this follows, same as
 * `stock-purchase-review`/`stock-count`'s own RPC adapters).
 */
export class SupabaseGroupedSettlementWriteAdapter implements GroupedSettlementWritePort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async confirm(
    organizationId: OrganizationId,
    movementId: string,
    links: GroupedSettlementLinkInput[]
  ): Promise<GroupedSettlementWriteResult> {
    const payload = links.map((l) => ({
      entity_id: l.entityId,
      document_type: l.documentType,
      allocated_amount_cents: l.allocatedAmountCents,
      expected_open_balance_cents: l.expectedOpenBalanceCents,
    }));

    const { data, error } = await this.scopedQuery(organizationId).confirmGroupedSettlement(movementId, payload);

    if (error) {
      const message = error.message;
      if (message.includes("movement_not_found")) {
        throw new MovementNotFoundError(movementId);
      }
      const staleMatch = message.match(/stale_document:([0-9a-fA-F-]+)/);
      if (staleMatch) {
        throw new StaleDocumentBalanceError([staleMatch[1]!]);
      }
      throw new Error(message);
    }

    const row = (Array.isArray(data) ? data[0] : data) as unknown as { reconciliation_status: string } | null;
    if (!row) throw new Error("fn_reconcile_movement_grouped returned no row");

    return { reconciliationStatus: row.reconciliation_status as ReconciliationStatus };
  }
}
