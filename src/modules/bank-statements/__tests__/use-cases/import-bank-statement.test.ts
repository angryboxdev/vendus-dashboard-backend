import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ImportBankStatementUseCase } from "../../application/use-cases/import-bank-statement.use-case.js";
import { FakeBankStatementImportRepository } from "../fakes/fake-bank-statement-import-repository.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import type { ImportBankStatementCommand } from "../../domain/ports/in/bank-statement.ports.js";

const organizationId = mintOrganizationId("org-a");

const baseCommand: ImportBankStatementCommand = {
  organizationId,
  bankName: "Millennium BCP",
  accountNumber: "PT123",
  periodStart: new Date("2026-06-30T00:00:00.000Z"),
  periodEnd: new Date("2026-07-07T00:00:00.000Z"),
  sourceType: "csv",
  openingBalance: 150_000,
  closingBalance: 145_000,
  movements: [
    {
      bookingDate: new Date("2026-07-01T00:00:00.000Z"),
      valueDate: new Date("2026-07-01T00:00:00.000Z"),
      description: "COM.MAN.CONTA",
      amount: 500,
      balanceAfter: 149_500,
      movementType: "debit",
    },
    {
      bookingDate: new Date("2026-07-02T00:00:00.000Z"),
      valueDate: new Date("2026-07-02T00:00:00.000Z"),
      description: "TRANSFERENCIA RECEBIDA",
      amount: 50_000,
      balanceAfter: 199_500,
      movementType: "credit",
    },
  ],
};

describe("ImportBankStatementUseCase", () => {
  let statementRepo: FakeBankStatementImportRepository;
  let movementRepo: FakeBankMovementRepository;
  let useCase: ImportBankStatementUseCase;

  beforeEach(() => {
    statementRepo = new FakeBankStatementImportRepository();
    movementRepo = new FakeBankMovementRepository();
    useCase = new ImportBankStatementUseCase(statementRepo, movementRepo);
  });

  it("imports all movements and persists the statement", async () => {
    const result = await useCase.execute(baseCommand);

    expect(result.importedMovementsCount).toBe(2);
    expect(result.skippedDuplicates).toBe(0);
    expect(result.bankName).toBe("Millennium BCP");
    expect(result.status).toBe("in_review");
  });

  it("computes calculatedClosingBalance correctly", async () => {
    const result = await useCase.execute(baseCommand);
    // 150_000 - 500 + 50_000 = 199_500
    expect(result.calculatedClosingBalance).toBe(199_500);
    // diff = 199_500 - 145_000 = 54_500
    expect(result.balanceDifference).toBe(54_500);
  });

  it("skips duplicate movements on re-import", async () => {
    await useCase.execute(baseCommand);
    const result = await useCase.execute(baseCommand);

    expect(result.skippedDuplicates).toBe(2);
    expect(result.importedMovementsCount).toBe(0);
  });

  it("imports with zero movements when all are duplicates", async () => {
    await useCase.execute(baseCommand);
    const result2 = await useCase.execute({ ...baseCommand, movements: [] });
    expect(result2.importedMovementsCount).toBe(0);
  });

  it("propagates bankAccountId to all saved movements", async () => {
    const bankAccountId = "bank-acc-xyz";
    await useCase.execute({ ...baseCommand, bankAccountId });

    const allStatements = await statementRepo.findAll(organizationId, {});
    const movements = await movementRepo.findByStatementId(organizationId, allStatements[0].id);

    expect(movements).toHaveLength(2);
    expect(movements.every((m) => m.bankAccountId === bankAccountId)).toBe(true);
  });

  it("sets bankAccountId to null on movements when not provided", async () => {
    await useCase.execute(baseCommand);

    const allStatements = await statementRepo.findAll(organizationId, {});
    const movements = await movementRepo.findByStatementId(organizationId, allStatements[0].id);

    expect(movements.every((m) => m.bankAccountId === null)).toBe(true);
  });
});
