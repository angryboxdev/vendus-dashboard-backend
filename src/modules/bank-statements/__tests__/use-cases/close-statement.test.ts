import { describe, it, expect, beforeEach } from "@jest/globals";
import { CloseStatementUseCase } from "../../application/use-cases/close-statement.use-case.js";
import { BankStatementImport } from "../../domain/entities/bank-statement-import.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { FakeBankStatementImportRepository } from "../fakes/fake-bank-statement-import-repository.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import {
  StatementNotFoundError,
  StatementBalanceDifferenceError,
  BlockingMovementsError,
} from "../../domain/errors.js";

function makeBalancedStatement() {
  const stmt = BankStatementImport.create({
    bankName: "BCP",
    accountNumber: "PT123",
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2026-07-07T00:00:00.000Z"),
    sourceType: "csv",
    openingBalance: 150_000,
    closingBalance: 145_000,
  });
  // calculatedClosingBalance = 145_000 → diff = 0
  return stmt.updateStats({
    importedMovementsCount: 1,
    calculatedClosingBalance: 145_000,
    reconciliationProgress: 100,
  });
}

function makeDebit(stmtId: string, hash: string, amount = 500) {
  return BankMovement.create({
    statementImportId: stmtId,
    bookingDate: new Date("2026-07-01T00:00:00.000Z"),
    valueDate: new Date("2026-07-01T00:00:00.000Z"),
    description: "PAGAMENTO",
    amount,
    balanceAfter: 149_500,
    movementType: "debit",
    deduplicationHash: hash,
  });
}

describe("CloseStatementUseCase", () => {
  let statementRepo: FakeBankStatementImportRepository;
  let movementRepo: FakeBankMovementRepository;
  let useCase: CloseStatementUseCase;

  beforeEach(() => {
    statementRepo = new FakeBankStatementImportRepository();
    movementRepo = new FakeBankMovementRepository();
    useCase = new CloseStatementUseCase(statementRepo, movementRepo);
  });

  it("throws StatementNotFoundError for unknown id", async () => {
    await expect(useCase.execute("not-found")).rejects.toThrow(StatementNotFoundError);
  });

  it("throws StatementBalanceDifferenceError when diff != 0", async () => {
    const stmt = BankStatementImport.create({
      bankName: "BCP",
      accountNumber: "PT123",
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-07-07T00:00:00.000Z"),
      sourceType: "csv",
      openingBalance: 150_000,
      closingBalance: 145_000,
    }).updateStats({
      importedMovementsCount: 1,
      calculatedClosingBalance: 148_000, // diff = 3_000 ≠ 0
      reconciliationProgress: 100,
    });
    await statementRepo.save(stmt);
    await expect(useCase.execute(stmt.id)).rejects.toThrow(StatementBalanceDifferenceError);
  });

  it("throws BlockingMovementsError when high-risk unjustified movements exist", async () => {
    const stmt = makeBalancedStatement();
    await statementRepo.save(stmt);
    // High-risk debit: 5000€ → risk = critical
    const m = makeDebit(stmt.id, "h1", 500_000);
    await movementRepo.saveBulk([m]);

    await expect(useCase.execute(stmt.id)).rejects.toThrow(BlockingMovementsError);
  });

  it("closes successfully when balance is 0 and no blocking movements", async () => {
    const stmt = makeBalancedStatement();
    await statementRepo.save(stmt);
    // Low-risk (< 50€) unjustified movement — not blocking
    const m = makeDebit(stmt.id, "h1", 100);
    await movementRepo.saveBulk([m]);

    await useCase.execute(stmt.id);

    const closed = await statementRepo.findById(stmt.id);
    expect(closed?.status).toBe("closed");
  });

  it("closes successfully with no movements", async () => {
    const stmt = makeBalancedStatement();
    await statementRepo.save(stmt);

    await useCase.execute(stmt.id);

    const closed = await statementRepo.findById(stmt.id);
    expect(closed?.status).toBe("closed");
  });
});
