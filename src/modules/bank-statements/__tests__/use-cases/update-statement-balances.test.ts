import { describe, it, expect, beforeEach } from "@jest/globals";
import { UpdateStatementBalancesUseCase } from "../../application/use-cases/update-statement-balances.use-case.js";
import { BankStatementImport } from "../../domain/entities/bank-statement-import.js";
import { FakeBankStatementImportRepository } from "../fakes/fake-bank-statement-import-repository.js";
import { StatementNotFoundError, StatementAlreadyClosedError } from "../../domain/errors.js";

function makeStatement() {
  return BankStatementImport.create({
    bankName: "Millennium BCP",
    accountNumber: "1234-5678",
    periodStart: new Date("2026-07-01"),
    periodEnd: new Date("2026-07-31"),
    sourceType: "csv",
    openingBalance: 100_000,
    closingBalance: 95_000,
  });
}

describe("UpdateStatementBalancesUseCase", () => {
  let repo: FakeBankStatementImportRepository;
  let useCase: UpdateStatementBalancesUseCase;
  let statement: BankStatementImport;

  beforeEach(async () => {
    repo = new FakeBankStatementImportRepository();
    useCase = new UpdateStatementBalancesUseCase(repo);
    statement = makeStatement();
    await repo.save(statement);
  });

  it("throws StatementNotFoundError for unknown id", async () => {
    await expect(
      useCase.execute("not-found", 100_000, 90_000)
    ).rejects.toThrow(StatementNotFoundError);
  });

  it("updates opening and closing balances", async () => {
    await useCase.execute(statement.id, 200_000, 180_000);

    const updated = await repo.findById(statement.id);
    expect(updated!.openingBalance).toBe(200_000);
    expect(updated!.closingBalance).toBe(180_000);
  });

  it("recalculates balanceDifference after update", async () => {
    // calculatedClosingBalance starts at openingBalance (100_000) since no movements
    // After update closingBalance = 90_000:  diff = 100_000 - 90_000 = 10_000
    await useCase.execute(statement.id, 100_000, 90_000);

    const updated = await repo.findById(statement.id);
    expect(updated!.balanceDifference).toBe(10_000);
  });

  it("throws StatementAlreadyClosedError for a closed statement", async () => {
    // Force the statement into closedstate: set balanceDiff = 0 first
    const balanced = BankStatementImport.reconstitute({
      ...Object.assign({} as BankStatementImport, statement),
      calculatedClosingBalance: 95_000,
      balanceDifference: 0,
      status: "draft" as const,
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
      reconciliationProgress: statement.reconciliationProgress,
      createdAt: statement.createdAt,
      updatedAt: statement.updatedAt,
    });
    const closed = balanced.close();
    await repo.save(closed);

    await expect(
      useCase.execute(closed.id, 200_000, 200_000)
    ).rejects.toThrow(StatementAlreadyClosedError);
  });
});
