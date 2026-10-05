import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { MovementNotFoundError, StaleDocumentBalanceError } from "../../domain/errors.js";
import type {
  GroupedSettlementLinkInput,
  GroupedSettlementWritePort,
  GroupedSettlementWriteResult,
} from "../../domain/ports/out/grouped-settlement-write.port.js";
import type { BankMovementEntityLink } from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";
import type { ReconciliationStatus } from "../../domain/entities/bank-movement.js";

interface FakeMovement {
  id: string;
  amount: number;
}

interface FakeInvoice {
  id: string;
  totalWithVat: number; // signed
  documentType: "invoice" | "credit_note";
}

/**
 * In-memory stand-in for the `fn_reconcile_movement_grouped` RPC, mirroring
 * its behaviour closely enough to unit-test `ConfirmGroupedSettlementUseCase`
 * and the use-case-level scenarios from the task's test list (stale
 * detection, idempotent re-submission, atomic all-or-nothing). It does NOT
 * exercise the actual SQL — that only runs against a real Postgres — but it
 * gives the same "recompute true open balance excluding this movement's own
 * links, compare to expected, reject the whole batch on any mismatch" shape.
 */
export class FakeGroupedSettlementWrite implements GroupedSettlementWritePort {
  movements = new Map<string, FakeMovement>();
  invoices = new Map<string, FakeInvoice>();
  links: BankMovementEntityLink[] = [];
  /** Test hook: throw this error on the NEXT call only (simulates a mid-transaction failure). */
  failNextCallWith: Error | null = null;
  calls: Array<{ movementId: string; links: GroupedSettlementLinkInput[] }> = [];

  private trueOpenBalance(entityId: string, excludingMovementId: string): number {
    const invoice = this.invoices.get(entityId);
    if (!invoice) throw new Error(`document_not_found:${entityId}`);
    const allocated = this.links
      .filter((l) => l.entityId === entityId && l.movementId !== excludingMovementId)
      .reduce((s, l) => s + l.allocatedAmountCents, 0);
    return invoice.totalWithVat - allocated;
  }

  async confirm(
    _organizationId: OrganizationId,
    movementId: string,
    links: GroupedSettlementLinkInput[]
  ): Promise<GroupedSettlementWriteResult> {
    this.calls.push({ movementId, links });

    if (this.failNextCallWith) {
      const err = this.failNextCallWith;
      this.failNextCallWith = null;
      throw err;
    }

    const movement = this.movements.get(movementId);
    if (!movement) throw new MovementNotFoundError(movementId);

    // ── Pass 1: validate everything before writing anything (atomicity) ────
    for (const link of links) {
      const trueOpen = this.trueOpenBalance(link.entityId, movementId);
      if (trueOpen !== link.expectedOpenBalanceCents) {
        throw new StaleDocumentBalanceError([link.entityId]);
      }
    }

    // ── Pass 2: writes ───────────────────────────────────────────────────────
    this.links = this.links.filter((l) => l.movementId !== movementId);
    for (const link of links) {
      this.links.push({
        id: `link-${movementId}-${link.entityId}`,
        movementId,
        entityType: "invoice",
        entityId: link.entityId,
        amountCents: this.invoices.get(link.entityId)!.totalWithVat,
        allocatedAmountCents: link.allocatedAmountCents,
        entityLabel: `Fake — ${link.entityId}`,
      });
    }

    const totalNet = links.reduce((s, l) => s + l.allocatedAmountCents, 0);
    const diff = movement.amount - totalNet;
    const isPartial = Math.abs(diff) > 100;
    const reconciliationStatus: ReconciliationStatus = isPartial ? "conciliado_parcial" : "conciliado_com_fatura";

    return { reconciliationStatus };
  }
}
