import { createHash } from "node:crypto";
import { BankStatementImport } from "../../domain/entities/bank-statement-import.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { ReconciliationCalculatorService } from "../../domain/services/reconciliation-calculator.service.js";
import type { BankStatementImportRepositoryPort } from "../../domain/ports/out/bank-statement-import-repository.port.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type {
  ImportBankStatementCommand,
  ImportBankStatementPort,
  ImportBankStatementResult,
} from "../../domain/ports/in/bank-statement.ports.js";

function buildDeduplicationHash(
  accountNumber: string,
  bookingDate: Date,
  description: string,
  amount: number,
  movementType: string
): string {
  const input = [
    accountNumber,
    bookingDate.toISOString().slice(0, 10),
    description,
    amount.toString(),
    movementType,
  ].join("|");
  return createHash("sha256").update(input).digest("hex");
}

export class ImportBankStatementUseCase implements ImportBankStatementPort {
  private readonly calculator = new ReconciliationCalculatorService();

  constructor(
    private readonly statementRepo: BankStatementImportRepositoryPort,
    private readonly movementRepo: BankMovementRepositoryPort
  ) {}

  async execute(command: ImportBankStatementCommand): Promise<ImportBankStatementResult> {
    // 1. Create import header
    const statement = BankStatementImport.create({
      bankName: command.bankName,
      accountNumber: command.accountNumber,
      periodStart: command.periodStart,
      periodEnd: command.periodEnd,
      ...(command.currency !== undefined ? { currency: command.currency } : {}),
      sourceType: command.sourceType,
      ...(command.sourceFileName !== undefined ? { sourceFileName: command.sourceFileName } : {}),
      openingBalance: command.openingBalance,
      closingBalance: command.closingBalance,
    });

    await this.statementRepo.save(statement);

    // 2. Build movements, skipping duplicates
    const toSave: BankMovement[] = [];
    let skippedDuplicates = 0;

    // If the file didn't supply balances (all zero), compute them from openingBalance.
    // Sort ascending by bookingDate first — files like BCP XLSX come newest-first.
    const allBalancesZero = command.movements.every((m) => m.balanceAfter === 0);
    const resolvedMovements = allBalancesZero
      ? (() => {
          const sorted = [...command.movements].sort(
            (a, b) => a.bookingDate.getTime() - b.bookingDate.getTime()
          );
          let running = command.openingBalance;
          return sorted.map((m) => {
            running += m.movementType === "credit" ? m.amount : -m.amount;
            return { ...m, balanceAfter: running };
          });
        })()
      : command.movements;

    for (const raw of resolvedMovements) {
      const hash = buildDeduplicationHash(
        command.accountNumber,
        raw.bookingDate,
        raw.description,
        raw.amount,
        raw.movementType
      );

      const exists = await this.movementRepo.existsByHash(hash);
      if (exists) {
        skippedDuplicates++;
        continue;
      }

      toSave.push(
        BankMovement.create({
          statementImportId: statement.id,
          bookingDate: raw.bookingDate,
          valueDate: raw.valueDate,
          description: raw.description,
          amount: raw.amount,
          balanceAfter: raw.balanceAfter,
          ...(command.currency !== undefined ? { currency: command.currency } : {}),
          movementType: raw.movementType,
          deduplicationHash: hash,
        })
      );
    }

    if (toSave.length > 0) {
      await this.movementRepo.saveBulk(toSave);
    }

    // 3. Compute stats and update statement
    const stats = this.calculator.compute(command.openingBalance, toSave);
    const updated = statement.updateStats({
      importedMovementsCount: toSave.length,
      calculatedClosingBalance: stats.calculatedClosingBalance,
      reconciliationProgress: stats.reconciliationProgress,
    });

    await this.statementRepo.update(updated);

    return {
      id: updated.id,
      bankName: updated.bankName,
      accountNumber: updated.accountNumber,
      importedMovementsCount: updated.importedMovementsCount,
      skippedDuplicates,
      calculatedClosingBalance: updated.calculatedClosingBalance,
      balanceDifference: updated.balanceDifference,
      reconciliationProgress: updated.reconciliationProgress,
      status: updated.status,
    };
  }
}
