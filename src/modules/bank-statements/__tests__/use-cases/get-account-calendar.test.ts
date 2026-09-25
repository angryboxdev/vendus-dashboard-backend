import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetAccountCalendarUseCase } from "../../application/use-cases/get-account-calendar.use-case.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";

const ACCOUNT_ID = "acc-001";

function makeMovement(
  date: string,
  movementType: "debit" | "credit" = "debit",
  reconciled = false,
  amount = 1000,
  bankAccountId = ACCOUNT_ID,
): BankMovement {
  const m = BankMovement.create({
    bankAccountId,
    statementImportId: "stmt-1",
    bookingDate: new Date(`${date}T00:00:00.000Z`),
    valueDate: new Date(`${date}T00:00:00.000Z`),
    description: "Test movement",
    amount,
    balanceAfter: 10000,
    movementType,
    deduplicationHash: `${date}-${movementType}-${Math.random()}`,
  });
  if (reconciled) {
    // classify as transfer (a RESOLVED_STATUS)
    return m.classify({
      justificationType: "transferencia_interna",
      riskLevel: "low",
      requiresDocument: false,
    });
  }
  return m;
}

describe("GetAccountCalendarUseCase", () => {
  const organizationId = mintOrganizationId("org-a");
  let movementRepo: FakeBankMovementRepository;
  let useCase: GetAccountCalendarUseCase;

  beforeEach(() => {
    movementRepo = new FakeBankMovementRepository();
    useCase = new GetAccountCalendarUseCase(movementRepo);
  });

  it("returns an entry for each month up to current month for current year", async () => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: currentYear });

    expect(result).toHaveLength(currentMonth);
    expect(result[0].month).toBe(1);
    expect(result[result.length - 1].month).toBe(currentMonth);
  });

  it("returns 12 months for past years", async () => {
    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2025 });
    expect(result).toHaveLength(12);
  });

  it("reports zero movements and 100% (nothing to reconcile) for months with no data", async () => {
    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2025 });
    const jan = result.find((m) => m.month === 1)!;
    expect(jan.totalMovements).toBe(0);
    expect(jan.salesReconciledPercent).toBe(100);
    expect(jan.expensesReconciledPercent).toBe(100);
    expect(jan.balanceCents).toBe(0);
  });

  it("computes reconciledMovements/totalMovements across both credits and debits", async () => {
    await movementRepo.saveBulk(organizationId, [
      makeMovement("2025-03-01", "debit", true),
      makeMovement("2025-03-02", "debit", true),
      makeMovement("2025-03-03", "debit", false),
      makeMovement("2025-03-04", "debit", false),
    ]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2025 });
    const march = result.find((m) => m.month === 3)!;

    expect(march.reconciledMovements).toBe(2);
    expect(march.totalMovements).toBe(4);
  });

  it("computes salesReconciledPercent and expensesReconciledPercent independently", async () => {
    await movementRepo.saveBulk(organizationId, [
      // credits: created auto-resolved (conciliado_sem_fatura) — 2/2 resolved
      makeMovement("2025-04-01", "credit"),
      makeMovement("2025-04-02", "credit"),
      // debits: only 1 of 3 resolved
      makeMovement("2025-04-03", "debit", true),
      makeMovement("2025-04-04", "debit", false),
      makeMovement("2025-04-05", "debit", false),
    ]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2025 });
    const april = result.find((m) => m.month === 4)!;

    expect(april.salesReconciledPercent).toBe(100);
    expect(april.expensesReconciledPercent).toBe(33); // round(1/3 * 100)
  });

  it("computes totalCreditCents, totalDebitCents e balanceCents (negativo quando saiu mais do que entrou)", async () => {
    await movementRepo.saveBulk(organizationId, [
      makeMovement("2025-09-01", "credit", false, 200_000), // entrou 2000€
      makeMovement("2025-09-02", "debit", false, 300_000),  // saiu 3000€
    ]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2025 });
    const september = result.find((m) => m.month === 9)!;

    expect(september.totalCreditCents).toBe(200_000);
    expect(september.totalDebitCents).toBe(300_000);
    expect(september.balanceCents).toBe(-100_000);
  });

  it("balanceCents é positivo quando entrou mais do que saiu", async () => {
    await movementRepo.saveBulk(organizationId, [
      makeMovement("2025-10-01", "credit", false, 500_000),
      makeMovement("2025-10-02", "debit", false, 100_000),
    ]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2025 });
    const october = result.find((m) => m.month === 10)!;
    expect(october.balanceCents).toBe(400_000);
  });

  it("ignores movements from other accounts", async () => {
    await movementRepo.saveBulk(organizationId, [
      makeMovement("2025-05-10", "debit", false, 1000, "other-acc"),
    ]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2025 });
    const may = result.find((m) => m.month === 5)!;
    expect(may.totalMovements).toBe(0);
  });

  it("reports 100% expensesReconciledPercent when all debits are resolved", async () => {
    await movementRepo.saveBulk(organizationId, [
      makeMovement("2025-06-10", "debit", true),
      makeMovement("2025-06-20", "debit", true),
    ]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2025 });
    const june = result.find((m) => m.month === 6)!;
    expect(june.expensesReconciledPercent).toBe(100);
  });
});
