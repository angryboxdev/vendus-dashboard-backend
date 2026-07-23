import { ReconciliationCalculatorService } from "../../domain/services/reconciliation-calculator.service.js";
import type { BankStatementImportRepositoryPort } from "../../domain/ports/out/bank-statement-import-repository.port.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { BankMovementEntityLinkRepositoryPort, BankMovementEntityLink } from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";
import type {
  BankMovementDto,
  BankStatementDetail,
  GetBankStatementFilter,
  GetBankStatementPort,
} from "../../domain/ports/in/bank-statement.ports.js";
import type { BankMovement } from "../../domain/entities/bank-movement.js";

function toMovementDto(m: BankMovement, links: BankMovementEntityLink[], computedBalanceAfter: number): BankMovementDto {
  return {
    id: m.id,
    bookingDate: m.bookingDate,
    valueDate: m.valueDate,
    description: m.description,
    amount: m.amount,
    balanceAfter: computedBalanceAfter,
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
      entityLabel: l.entityLabel,
    })),
    reconciliationAmountDiff: m.reconciliationAmountDiff,
  };
}

export class GetBankStatementUseCase implements GetBankStatementPort {
  private readonly calculator = new ReconciliationCalculatorService();

  constructor(
    private readonly statementRepo: BankStatementImportRepositoryPort,
    private readonly movementRepo: BankMovementRepositoryPort,
    private readonly linkRepo: BankMovementEntityLinkRepositoryPort,
  ) {}

  async execute(
    id: string,
    filter?: GetBankStatementFilter
  ): Promise<BankStatementDetail | null> {
    const statement = await this.statementRepo.findById(id);
    if (!statement) return null;

    const movements = await this.movementRepo.findByStatementId(id, filter);
    const stats = this.calculator.compute(statement.openingBalance, movements);

    // Bulk-load entity links for all movements in one query
    const movementIds = movements.map((m) => m.id);
    const allLinks = movementIds.length > 0
      ? await this.linkRepo.findByMovementIds(movementIds)
      : [];

    const linksByMovementId = new Map<string, BankMovementEntityLink[]>();
    for (const link of allLinks) {
      const existing = linksByMovementId.get(link.movementId) ?? [];
      existing.push(link);
      linksByMovementId.set(link.movementId, existing);
    }

    // Compute running balance from openingBalance so that edits to openingBalance
    // are immediately reflected in the per-movement balanceAfter values.
    let runningBalance = statement.openingBalance;
    const movementDtos = movements.map((m) => {
      runningBalance += m.movementType === "credit" ? m.amount : -m.amount;
      return toMovementDto(m, linksByMovementId.get(m.id) ?? [], runningBalance);
    });

    return {
      id: statement.id,
      bankName: statement.bankName,
      accountNumber: statement.accountNumber,
      periodStart: statement.periodStart,
      periodEnd: statement.periodEnd,
      currency: statement.currency,
      sourceType: statement.sourceType,
      sourceFileName: statement.sourceFileName,
      importedMovementsCount: statement.importedMovementsCount,
      openingBalance: statement.openingBalance,
      closingBalance: statement.closingBalance,
      calculatedClosingBalance: stats.calculatedClosingBalance,
      balanceDifference: stats.calculatedClosingBalance - statement.closingBalance,
      reconciliationProgress: stats.reconciliationProgress,
      status: statement.status,
      createdAt: statement.createdAt,
      movements: movementDtos,
      statusCounts: stats.statusCounts,
    };
  }
}
