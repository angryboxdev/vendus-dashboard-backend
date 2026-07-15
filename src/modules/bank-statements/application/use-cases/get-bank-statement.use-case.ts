import { ReconciliationCalculatorService } from "../../domain/services/reconciliation-calculator.service.js";
import type { BankStatementImportRepositoryPort } from "../../domain/ports/out/bank-statement-import-repository.port.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type {
  BankMovementDto,
  BankStatementDetail,
  GetBankStatementFilter,
  GetBankStatementPort,
} from "../../domain/ports/in/bank-statement.ports.js";
import type { BankMovement } from "../../domain/entities/bank-movement.js";

function toMovementDto(m: BankMovement): BankMovementDto {
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
  };
}

export class GetBankStatementUseCase implements GetBankStatementPort {
  private readonly calculator = new ReconciliationCalculatorService();

  constructor(
    private readonly statementRepo: BankStatementImportRepositoryPort,
    private readonly movementRepo: BankMovementRepositoryPort
  ) {}

  async execute(
    id: string,
    filter?: GetBankStatementFilter
  ): Promise<BankStatementDetail | null> {
    const statement = await this.statementRepo.findById(id);
    if (!statement) return null;

    const movements = await this.movementRepo.findByStatementId(id, filter);
    const stats = this.calculator.compute(statement.openingBalance, movements);

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
      movements: movements.map(toMovementDto),
      statusCounts: stats.statusCounts,
    };
  }
}
