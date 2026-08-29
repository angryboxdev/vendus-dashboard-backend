import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetAccountMonthDetailUseCase } from "../../application/use-cases/get-account-month-detail.use-case.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeBankMovementEntityLinkRepository } from "../fakes/fake-bank-movement-entity-link-repository.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";

const ACCOUNT_ID = "acc-001";

function makeMovement(
  date: string,
  movementType: "debit" | "credit" = "debit",
  amount = 1000,
): BankMovement {
  return BankMovement.create({
    bankAccountId: ACCOUNT_ID,
    statementImportId: "stmt-1",
    bookingDate: new Date(`${date}T00:00:00.000Z`),
    valueDate: new Date(`${date}T00:00:00.000Z`),
    description: `Movement ${date} ${movementType}`,
    amount,
    balanceAfter: 10000,
    movementType,
    deduplicationHash: `${date}-${movementType}-${amount}-${Math.random()}`,
  });
}

describe("GetAccountMonthDetailUseCase", () => {
  const organizationId = mintOrganizationId("org-a");
  let movementRepo: FakeBankMovementRepository;
  let linkRepo: FakeBankMovementEntityLinkRepository;
  let useCase: GetAccountMonthDetailUseCase;

  beforeEach(() => {
    movementRepo = new FakeBankMovementRepository();
    linkRepo = new FakeBankMovementEntityLinkRepository();
    useCase = new GetAccountMonthDetailUseCase(movementRepo, linkRepo);
  });

  it("returns empty array when no movements exist", async () => {
    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2025, month: 3 });
    expect(result).toEqual([]);
  });

  it("groups movements by booking date", async () => {
    await movementRepo.saveBulk(organizationId, [
      makeMovement("2025-03-01"),
      makeMovement("2025-03-01"),
      makeMovement("2025-03-15"),
    ]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2025, month: 3 });

    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2025-03-01");
    expect(result[0].totalMovements).toBe(2);
    expect(result[1].date).toBe("2025-03-15");
    expect(result[1].totalMovements).toBe(1);
  });

  it("returns days in chronological order", async () => {
    await movementRepo.saveBulk(organizationId, [
      makeMovement("2025-03-20"),
      makeMovement("2025-03-05"),
      makeMovement("2025-03-10"),
    ]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2025, month: 3 });

    expect(result.map((d) => d.date)).toEqual(["2025-03-05", "2025-03-10", "2025-03-20"]);
  });

  it("computes totalDebitCents and totalCreditCents per day", async () => {
    await movementRepo.saveBulk(organizationId, [
      makeMovement("2025-03-01", "debit", 500),
      makeMovement("2025-03-01", "debit", 300),
      makeMovement("2025-03-01", "credit", 1200),
    ]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2025, month: 3 });

    expect(result[0].totalDebitCents).toBe(800);
    expect(result[0].totalCreditCents).toBe(1200);
  });

  it("counts reconciledCount correctly per day", async () => {
    const m1 = makeMovement("2025-03-01", "debit");
    const m2 = makeMovement("2025-03-01", "credit"); // credits are auto-resolved
    const m3 = makeMovement("2025-03-01", "debit");
    await movementRepo.saveBulk(organizationId, [m1, m2, m3]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2025, month: 3 });

    // Only the credit (m2) is auto-resolved (conciliado_sem_fatura)
    expect(result[0].reconciledCount).toBe(1);
  });

  it("only includes movements within the requested month", async () => {
    await movementRepo.saveBulk(organizationId, [
      makeMovement("2025-02-28"),  // February — should be excluded
      makeMovement("2025-03-01"),  // March — included
      makeMovement("2025-04-01"),  // April — should be excluded
    ]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2025, month: 3 });

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2025-03-01");
  });

  it("attaches entity links to movement DTOs", async () => {
    const m = makeMovement("2025-03-10", "debit", 5000);
    await movementRepo.saveBulk(organizationId, [m]);
    await linkRepo.saveAll(organizationId, [
      {
        id: "link-1",
        movementId: m.id,
        entityType: "invoice",
        entityId: "inv-1",
        amountCents: 5000,
        allocatedAmountCents: 5000,
        entityLabel: "FT 2025/001",
      },
    ]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2025, month: 3 });

    expect(result[0].movements[0].entityLinks).toHaveLength(1);
    expect(result[0].movements[0].entityLinks[0].entityLabel).toBe("FT 2025/001");
  });
});
