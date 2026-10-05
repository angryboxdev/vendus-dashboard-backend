import type { GroupedSettlementWritePort } from "../../domain/ports/out/grouped-settlement-write.port.js";
import type {
  ConfirmGroupedSettlementCommand,
  ConfirmGroupedSettlementPort,
  ConfirmGroupedSettlementResult,
} from "../../domain/ports/in/bank-statement.ports.js";

/**
 * Thin orchestrator: all the atomicity, revalidation and idempotency live in
 * the RPC behind `GroupedSettlementWritePort` (see its doc comment and the
 * module README, section "Liquidação agrupada", for why). This use case only
 * validates the shape of the input before delegating — the RPC is the one
 * source of truth for whether the write is actually safe to apply.
 */
export class ConfirmGroupedSettlementUseCase implements ConfirmGroupedSettlementPort {
  constructor(private readonly writePort: GroupedSettlementWritePort) {}

  async execute(command: ConfirmGroupedSettlementCommand): Promise<ConfirmGroupedSettlementResult> {
    const { organizationId, movementId, entityLinks } = command;

    if (entityLinks.length === 0) {
      throw new Error("At least one entity link is required");
    }
    for (const el of entityLinks) {
      if (el.allocatedAmountCents === 0) {
        throw new Error(`allocatedAmountCents must be non-zero (entity ${el.entityId})`);
      }
      if (el.documentType === "invoice" && el.allocatedAmountCents < 0) {
        throw new Error(`allocatedAmountCents must be positive for invoices (entity ${el.entityId})`);
      }
      if (el.documentType === "credit_note" && el.allocatedAmountCents > 0) {
        throw new Error(`allocatedAmountCents must be negative for credit notes (entity ${el.entityId})`);
      }
    }

    const result = await this.writePort.confirm(
      organizationId,
      movementId,
      entityLinks.map((el) => ({
        entityId: el.entityId,
        documentType: el.documentType,
        allocatedAmountCents: el.allocatedAmountCents,
        expectedOpenBalanceCents: el.expectedOpenBalanceCents,
      }))
    );

    return { movementId, reconciliationStatus: result.reconciliationStatus };
  }
}
