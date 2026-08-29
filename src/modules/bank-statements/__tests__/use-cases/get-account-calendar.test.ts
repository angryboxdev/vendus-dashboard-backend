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
  bankAccountId = ACCOUNT_ID,
): BankMovement {
  const m = BankMovement.create({
    bankAccountId,
    statementImportId: "stmt-1",
    bookingDate: new Date(`${date}T00:00:00.000Z`),
    valueDate: new Date(`${date}T00:00:00.000Z`),
    description: "Test movement",
    amount: 1000,
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

  it("counts zero movements and zero coverage for months with no data", async () => {
    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2025 });
    const jan = result.find((m) => m.month === 1)!;
    expect(jan.totalMovements).toBe(0);
    expect(jan.coveredDays).toBe(0);
    expect(jan.coveragePercent).toBe(0);
    expect(jan.reconciliationPercent).toBe(0);
  });

  it("computes coverage as unique days with movements / total days in month", async () => {
    await movementRepo.saveBulk(organizationId, [
      makeMovement("2025-03-01"),
      makeMovement("2025-03-01"), // same day — should not double-count
      makeMovement("2025-03-15"),
    ]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2025 });
    const march = result.find((m) => m.month === 3)!;

    expect(march.coveredDays).toBe(2); // only 2 unique days
    expect(march.totalMovements).toBe(3);
    expect(march.totalDays).toBe(31);
    expect(march.coveragePercent).toBe(Math.round((2 / 31) * 100));
  });

  it("computes reconciliation percent correctly", async () => {
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
    expect(march.reconciliationPercent).toBe(50);
  });

  it("ignores movements from other accounts", async () => {
    await movementRepo.saveBulk(organizationId, [
      makeMovement("2025-05-10", "debit", false, "other-acc"),
    ]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2025 });
    const may = result.find((m) => m.month === 5)!;
    expect(may.totalMovements).toBe(0);
  });

  it("reports 100% reconciliation when all movements are resolved", async () => {
    await movementRepo.saveBulk(organizationId, [
      makeMovement("2025-06-10", "debit", true),
      makeMovement("2025-06-20", "debit", true),
    ]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2025 });
    const june = result.find((m) => m.month === 6)!;
    expect(june.reconciliationPercent).toBe(100);
  });
});
