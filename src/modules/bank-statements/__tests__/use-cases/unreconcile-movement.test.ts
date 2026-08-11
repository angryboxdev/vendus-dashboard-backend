import { describe, it, expect, beforeEach } from "@jest/globals";
import { UnreconcileMovementUseCase } from "../../application/use-cases/unreconcile-movement.use-case.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeBankMovementEntityLinkRepository } from "../fakes/fake-bank-movement-entity-link-repository.js";
import { FakeInvoiceMatchRead } from "../fakes/fake-invoice-match-read.js";
import { FakeInvoiceReconciliationWrite } from "../fakes/fake-invoice-reconciliation-write.js";
import { MovementNotFoundError } from "../../domain/errors.js";
import type { BankMovementEntityLink } from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";
import type { InvoiceMatchCandidate } from "../../domain/ports/out/invoice-match-read.port.js";

function makeDebit(id = "mov-1", amountCents = 10_000) {
  const m = BankMovement.create({
    statementImportId: "stmt-1",
    bookingDate: new Date("2026-07-10T00:00:00.000Z"),
    valueDate: new Date("2026-07-10T00:00:00.000Z"),
    description: "TRF FORNECEDOR X",
    amount: amountCents,
    balanceAfter: 50_000,
    movementType: "debit",
    deduplicationHash: id,
  });
  // Override id via reconstitute so we can control it in tests
  return BankMovement.reconstitute({ ...extractProps(m), id });
}

function extractProps(m: BankMovement) {
  return {
    id: m.id,
    bankAccountId: m.bankAccountId,
    statementImportId: m.statementImportId,
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
    deduplicationHash: m.deduplicationHash,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    costCenterGroupId: m.costCenterGroupId,
    costCenterCategoryId: m.costCenterCategoryId,
    supplierId: m.supplierId,
    vatRate: m.vatRate,
    vatIncluded: m.vatIncluded,
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

function makeInvoice(id: string, totalWithVat: number): InvoiceMatchCandidate {
  return {
    id,
    supplierId: "sup-1",
    supplierName: "Supplier",
    invoiceNumber: `INV-${id}`,
    totalWithVat,
    invoiceDate: "2026-07-01",
    dueDate: "2026-07-31",
    paidAt: null,
    status: "paid",
  };
}

describe("UnreconcileMovementUseCase", () => {
  let repo: FakeBankMovementRepository;
  let linkRepo: FakeBankMovementEntityLinkRepository;
  let invoiceRead: FakeInvoiceMatchRead;
  let invoiceReconWrite: FakeInvoiceReconciliationWrite;
  let useCase: UnreconcileMovementUseCase;

  beforeEach(() => {
    repo = new FakeBankMovementRepository();
    linkRepo = new FakeBankMovementEntityLinkRepository();
    invoiceRead = new FakeInvoiceMatchRead();
    invoiceReconWrite = new FakeInvoiceReconciliationWrite();
    useCase = new UnreconcileMovementUseCase(repo, linkRepo, invoiceRead, invoiceReconWrite);
  });

  it("throws MovementNotFoundError for unknown movement", async () => {
    await expect(useCase.execute("does-not-exist")).rejects.toBeInstanceOf(MovementNotFoundError);
  });

  it("resets movement status to saida_nao_justificada", async () => {
    const movement = makeDebit("mov-1", 10_000).multiReconcile(0);
    await repo.saveBulk([movement]);
    await linkRepo.saveAll([makeLink("mov-1", "inv-1", 10_000)]);
    invoiceRead.setcandidates([makeInvoice("inv-1", 10_000)]);

    await useCase.execute("mov-1");

    const updated = await repo.findById("mov-1");
    expect(updated?.reconciliationStatus).toBe("saida_nao_justificada");
    expect(updated?.justificationType).toBeNull();
    expect(updated?.reconciliationAmountDiff).toBeNull();
  });

  it("deletes all entity links for the movement", async () => {
    const movement = makeDebit("mov-1", 10_000).multiReconcile(0);
    await repo.saveBulk([movement]);
    await linkRepo.saveAll([
      makeLink("mov-1", "inv-1", 6_000, 10_000),
      makeLink("mov-1", "inv-2", 4_000, 10_000),
    ]);
    invoiceRead.setcandidates([makeInvoice("inv-1", 10_000), makeInvoice("inv-2", 10_000)]);

    await useCase.execute("mov-1");

    const remaining = await linkRepo.findByMovementIds(["mov-1"]);
    expect(remaining).toHaveLength(0);
  });

  it("marks a fully-allocated invoice as unreconciled", async () => {
    const movement = makeDebit("mov-1", 10_000).multiReconcile(0);
    await repo.saveBulk([movement]);
    await linkRepo.saveAll([makeLink("mov-1", "inv-1", 10_000)]);
    invoiceRead.setcandidates([makeInvoice("inv-1", 10_000)]);

    await useCase.execute("mov-1");

    expect(invoiceReconWrite.unreconciledCalls).toContain("inv-1");
    expect(invoiceReconWrite.reconciledCalls).toHaveLength(0);
    expect(invoiceReconWrite.partialCalls).toHaveLength(0);
  });

  it("marks invoice as partially_reconciled when other movements still cover part of it", async () => {
    // mov-1 allocated 3000, mov-2 also allocated 3000 to the same invoice (total=10000)
    const movement = makeDebit("mov-1", 3_000).multiReconcile(0);
    const otherMovement = makeDebit("mov-2", 3_000);
    await repo.saveBulk([movement, otherMovement]);

    await linkRepo.saveAll([
      makeLink("mov-1", "inv-1", 3_000, 10_000),
      makeLink("mov-2", "inv-1", 3_000, 10_000), // other movement keeps its link
    ]);
    invoiceRead.setcandidates([makeInvoice("inv-1", 10_000)]);

    await useCase.execute("mov-1");

    // After removing mov-1's link, inv-1 still has 3000 allocated by mov-2 → partial
    expect(invoiceReconWrite.partialCalls).toContain("inv-1");
    expect(invoiceReconWrite.unreconciledCalls).not.toContain("inv-1");
  });

  it("marks invoice as reconciled when remaining allocations still cover the total", async () => {
    // mov-1 had a small partial allocation; mov-2 covers the full invoice
    const movement = makeDebit("mov-1", 1_000).multiReconcile(0);
    const otherMovement = makeDebit("mov-2", 10_000);
    await repo.saveBulk([movement, otherMovement]);

    await linkRepo.saveAll([
      makeLink("mov-1", "inv-1", 1_000, 10_000),
      makeLink("mov-2", "inv-1", 10_000, 10_000),
    ]);
    invoiceRead.setcandidates([makeInvoice("inv-1", 10_000)]);

    await useCase.execute("mov-1");

    // inv-1 still has 10_000 allocated from mov-2 ≥ totalWithVat (10_000) → reconciled
    expect(invoiceReconWrite.reconciledCalls.map((c) => c.invoiceId)).toContain("inv-1");
  });

  it("does not call invoice write when movement has no invoice links", async () => {
    const movement = makeDebit("mov-1", 5_000);
    await repo.saveBulk([movement]);
    // No links saved

    await useCase.execute("mov-1");

    expect(invoiceReconWrite.reconciledCalls).toHaveLength(0);
    expect(invoiceReconWrite.partialCalls).toHaveLength(0);
    expect(invoiceReconWrite.unreconciledCalls).toHaveLength(0);
  });
});
