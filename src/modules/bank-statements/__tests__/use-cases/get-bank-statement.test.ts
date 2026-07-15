import { describe, it, expect, beforeEach } from "@jest/globals";
import { GetBankStatementUseCase } from "../../application/use-cases/get-bank-statement.use-case.js";
import { BankStatementImport } from "../../domain/entities/bank-statement-import.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { FakeBankStatementImportRepository } from "../fakes/fake-bank-statement-import-repository.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";

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

function makeDebit(statementImportId: string, amount = 5_000, hash = "hash-1") {
  return BankMovement.create({
    statementImportId,
    bookingDate: new Date("2026-07-05"),
    valueDate: new Date("2026-07-05"),
    description: "PAGAMENTO EDP",
    amount,
    balanceAfter: 95_000,
    movementType: "debit",
    deduplicationHash: hash,
  });
}

describe("GetBankStatementUseCase", () => {
  let statementRepo: FakeBankStatementImportRepository;
  let movementRepo: FakeBankMovementRepository;
  let useCase: GetBankStatementUseCase;
  let statement: BankStatementImport;

  beforeEach(async () => {
    statementRepo = new FakeBankStatementImportRepository();
    movementRepo = new FakeBankMovementRepository();
    useCase = new GetBankStatementUseCase(statementRepo, movementRepo);
    statement = makeStatement();
    await statementRepo.save(statement);
  });

  it("returns null for unknown id", async () => {
    const result = await useCase.execute("not-found");
    expect(result).toBeNull();
  });

  it("returns detail with empty movements list", async () => {
    const result = await useCase.execute(statement.id);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(statement.id);
    expect(result!.movements).toHaveLength(0);
  });

  it("includes movement DTOs with all classification fields", async () => {
    const movement = makeDebit(statement.id);
    await movementRepo.saveBulk([movement]);

    const result = await useCase.execute(statement.id);
    expect(result!.movements).toHaveLength(1);
    const dto = result!.movements[0]!;
    expect(dto.id).toBe(movement.id);
    expect(dto.amount).toBe(5_000);
    expect(dto.movementType).toBe("debit");
    expect(dto.costCenterGroupId).toBeNull();
    expect(dto.costCenterCategoryId).toBeNull();
    expect(dto.supplierId).toBeNull();
    expect(dto.vatRate).toBeNull();
    expect(dto.vatIncluded).toBeNull();
  });

  it("recalculates stats live from movements", async () => {
    const debit = makeDebit(statement.id, 5_000, "h1");
    const credit = BankMovement.create({
      statementImportId: statement.id,
      bookingDate: new Date("2026-07-10"),
      valueDate: new Date("2026-07-10"),
      description: "TRANSFERENCIA RECEBIDA",
      amount: 10_000,
      balanceAfter: 105_000,
      movementType: "credit",
      deduplicationHash: "h2",
    });
    await movementRepo.saveBulk([debit, credit]);

    const result = await useCase.execute(statement.id);
    // openingBalance 100_000 - debit 5_000 + credit 10_000 = 105_000
    expect(result!.calculatedClosingBalance).toBe(105_000);
    expect(result!.balanceDifference).toBe(105_000 - 95_000); // 10_000
  });

  it("statusCounts reflects movement statuses", async () => {
    const debit = makeDebit(statement.id, 5_000, "h1");
    await movementRepo.saveBulk([debit]);

    const result = await useCase.execute(statement.id);
    expect(result!.statusCounts.saida_nao_justificada).toBe(1);
  });
});
