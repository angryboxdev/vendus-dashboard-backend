import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { BankMovementEntityLinkRepositoryPort, BankMovementEntityLink } from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";
import type {
  BankMovementDto,
  DaySlot,
  GetAccountMonthDetailPort,
  GetAccountMonthDetailQuery,
} from "../../domain/ports/in/bank-statement.ports.js";
import type { BankMovement } from "../../domain/entities/bank-movement.js";

function toMovementDto(m: BankMovement, links: BankMovementEntityLink[]): BankMovementDto {
  return {
    id: m.id,
    bookingDate: m.bookingDate,
    valueDate: m.valueDate,
    description: m.description,
    amount: m.amount,
    balanceAfter: m.balanceAfter,
    currency: m.currency,
    movementType: m.movementType,
    reconciliationStatus: m.reconciliationStatus,
    justificationType: m.justificationType,
    riskLevel: m.riskLevel,
    requiresDocument: m.requiresDocument,
    documentUrl: m.documentUrl,
    matchedEntityType: m.matchedEntityType,
    matchedEntityId: m.matchedEntityId,
    confidenceScore: m.confidenceScore,
    notes: m.notes,
    isResolved: m.isResolved,
    costCenterGroupId: m.costCenterGroupId,
    costCenterCategoryId: m.costCenterCategoryId,
    supplierId: m.supplierId,
    vatRate: m.vatRate,
    vatIncluded: m.vatIncluded,
    entityLinks: links.map((l) => ({
      id: l.id,
      entityType: l.entityType,
      entityId: l.entityId,
      amountCents: l.amountCents,
      allocatedAmountCents: l.allocatedAmountCents,
      entityLabel: l.entityLabel,
    })),
    reconciliationAmountDiff: m.reconciliationAmountDiff,
  };
}

export class GetAccountMonthDetailUseCase implements GetAccountMonthDetailPort {
  constructor(
    private readonly movementRepo: BankMovementRepositoryPort,
    private readonly linkRepo: BankMovementEntityLinkRepositoryPort,
  ) {}

  async execute({ bankAccountId, year, month }: GetAccountMonthDetailQuery): Promise<DaySlot[]> {
    const from = new Date(year, month - 1, 1);       // first day of month
    const to = new Date(year, month, 0);             // last day of month

    const movements = await this.movementRepo.findByAccountAndPeriod(bankAccountId, from, to);
    if (movements.length === 0) return [];

    // Bulk-load entity links
    const movementIds = movements.map((m) => m.id);
    const allLinks = await this.linkRepo.findByMovementIds(movementIds);
    const linksByMovementId = new Map<string, BankMovementEntityLink[]>();
    for (const link of allLinks) {
      const arr = linksByMovementId.get(link.movementId) ?? [];
      arr.push(link);
      linksByMovementId.set(link.movementId, arr);
    }

    // Group by booking date
    const byDate = new Map<string, BankMovement[]>();
    for (const m of movements) {
      const date = m.bookingDate.toISOString().slice(0, 10);
      const arr = byDate.get(date) ?? [];
      arr.push(m);
      byDate.set(date, arr);
    }

    // Build DaySlots in chronological order
    const result: DaySlot[] = [];
    for (const [date, dayMovements] of [...byDate.entries()].sort()) {
      const dtos = dayMovements.map((m) =>
        toMovementDto(m, linksByMovementId.get(m.id) ?? [])
      );
      result.push({
        date,
        movements: dtos,
        totalDebitCents: dayMovements
          .filter((m) => m.movementType === "debit")
          .reduce((s, m) => s + m.amount, 0),
        totalCreditCents: dayMovements
          .filter((m) => m.movementType === "credit")
          .reduce((s, m) => s + m.amount, 0),
        totalMovements: dayMovements.length,
        reconciledCount: dayMovements.filter((m) => m.isResolved).length,
      });
    }

    return result;
  }
}
