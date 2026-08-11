import { describe, it, expect, beforeEach } from "@jest/globals";
import { GetMovementsLinkedToInvoiceUseCase } from "../../application/use-cases/get-movements-linked-to-invoice.use-case.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeBankMovementEntityLinkRepository } from "../fakes/fake-bank-movement-entity-link-repository.js";
import type { BankMovementEntityLink } from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";

function makeMovement(id: string, amountCents: number, date = "2026-07-10") {
  const m = BankMovement.create({
    statementImportId: "stmt-1",
    bookingDate: new Date(`${date}T00:00:00.000Z`),
    valueDate: new Date(`${date}T00:00:00.000Z`),
    description: `Movimento ${id}`,
    amount: amountCents,
    balanceAfter: 100_000,
    movementType: "debit",
    deduplicationHash: id,
  });
  return BankMovement.reconstitute({ ...extractProps(m), id });
}

function extractProps(m: BankMovement) {
  return {
    id: m.id, bankAccountId: m.bankAccountId, statementImportId: m.statementImportId,
    bookingDate: m.bookingDate, valueDate: m.valueDate, description: m.description,
    amount: m.amount, balanceAfter: m.balanceAfter, currency: m.currency,
    movementType: m.movementType, reconciliationStatus: m.reconciliationStatus,
    justificationType: m.justificationType, riskLevel: m.riskLevel,
    requiresDocument: m.requiresDocument, documentUrl: m.documentUrl,
    matchedEntityType: m.matchedEntityType, matchedEntityId: m.matchedEntityId,
    confidenceScore: m.confidenceScore, notes: m.notes,
    deduplicationHash: m.deduplicationHash, createdAt: m.createdAt, updatedAt: m.updatedAt,
    costCenterGroupId: m.costCenterGroupId, costCenterCategoryId: m.costCenterCategoryId,
    supplierId: m.supplierId, vatRate: m.vatRate, vatIncluded: m.vatIncluded,
    reconciliationAmountDiff: m.reconciliationAmountDiff,
  };
}

function makeLink(
  movementId: string,
  entityId: string,
  allocatedAmountCents: number,
  amountCents = allocatedAmountCents,
): BankMovementEntityLink {
  return {
    id: `link-${movementId}-${entityId}`,
    movementId,
    entityType: "invoice",
    entityId,
    amountCents,
    allocatedAmountCents,
    entityLabel: `Supplier — INV-${entityId}`,
  };
}

describe("GetMovementsLinkedToInvoiceUseCase", () => {
  let movementRepo: FakeBankMovementRepository;
  let linkRepo: FakeBankMovementEntityLinkRepository;
  let useCase: GetMovementsLinkedToInvoiceUseCase;

  beforeEach(() => {
    movementRepo = new FakeBankMovementRepository();
    linkRepo = new FakeBankMovementEntityLinkRepository();
    useCase = new GetMovementsLinkedToInvoiceUseCase(linkRepo, movementRepo);
  });

  it("returns empty array when no links exist for the invoice", async () => {
    const result = await useCase.execute("inv-1");
    expect(result).toHaveLength(0);
  });

  it("returns the movement linked to an invoice", async () => {
    const movement = makeMovement("mov-1", 10_000, "2026-07-15");
    await movementRepo.saveBulk([movement]);
    await linkRepo.saveAll([makeLink("mov-1", "inv-1", 10_000)]);

    const result = await useCase.execute("inv-1");

    expect(result).toHaveLength(1);
    expect(result[0]!.movementId).toBe("mov-1");
    expect(result[0]!.bookingDate).toBe("2026-07-15");
    expect(result[0]!.description).toBe("Movimento mov-1");
    expect(result[0]!.allocatedAmountCents).toBe(10_000);
    expect(result[0]!.movementType).toBe("debit");
  });

  it("returns multiple movements when invoice is partially reconciled across movements", async () => {
    const mov1 = makeMovement("mov-1", 5_000, "2026-07-10");
    const mov2 = makeMovement("mov-2", 5_000, "2026-07-20");
    await movementRepo.saveBulk([mov1, mov2]);
    await linkRepo.saveAll([
      makeLink("mov-1", "inv-1", 5_000, 10_000),
      makeLink("mov-2", "inv-1", 5_000, 10_000),
    ]);

    const result = await useCase.execute("inv-1");

    expect(result).toHaveLength(2);
    const ids = result.map((r) => r.movementId);
    expect(ids).toContain("mov-1");
    expect(ids).toContain("mov-2");
  });

  it("returns correct allocatedAmountCents per movement (not the entity total)", async () => {
    const movement = makeMovement("mov-1", 30_000);
    await movementRepo.saveBulk([movement]);
    await linkRepo.saveAll([makeLink("mov-1", "inv-1", 30_000, 100_000)]);

    const result = await useCase.execute("inv-1");

    expect(result[0]!.allocatedAmountCents).toBe(30_000);
  });

  it("does not return movements linked to a different invoice", async () => {
    const movement = makeMovement("mov-1", 10_000);
    await movementRepo.saveBulk([movement]);
    await linkRepo.saveAll([makeLink("mov-1", "inv-OTHER", 10_000)]);

    const result = await useCase.execute("inv-1");
    expect(result).toHaveLength(0);
  });

  it("skips orphan links where the movement no longer exists", async () => {
    // Link exists but movement was deleted / never saved
    await linkRepo.saveAll([makeLink("mov-ghost", "inv-1", 5_000)]);

    const result = await useCase.execute("inv-1");
    expect(result).toHaveLength(0);
  });
});
