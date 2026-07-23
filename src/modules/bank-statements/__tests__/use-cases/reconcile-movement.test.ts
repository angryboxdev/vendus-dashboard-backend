import { describe, it, expect, beforeEach } from "@jest/globals";
import { ReconcileMovementUseCase } from "../../application/use-cases/reconcile-movement.use-case.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeMovementMatchHint } from "../fakes/fake-movement-match-hint.js";
import { FakeInvoiceMatchRead } from "../fakes/fake-invoice-match-read.js";
import { FakePayableEntryMatchRead } from "../fakes/fake-payable-entry-match-read.js";
import { FakeBankMovementEntityLinkRepository } from "../fakes/fake-bank-movement-entity-link-repository.js";
import { MovementNotFoundError, EntityAlreadyReconciledError } from "../../domain/errors.js";
import type { InvoiceMatchCandidate } from "../../domain/ports/out/invoice-match-read.port.js";
import type { PayableEntryMatchCandidate } from "../../domain/ports/out/payable-entry-match-read.port.js";

function makeDebit(amountCents = 70_000, hash = "hash-1") {
  return BankMovement.create({
    statementImportId: "stmt-1",
    bookingDate: new Date("2026-07-05"),
    valueDate: new Date("2026-07-05"),
    description: "PAGAMENTO GALP ENERGIA REF 12345",
    amount: amountCents,
    balanceAfter: 100_000 - amountCents,
    movementType: "debit",
    deduplicationHash: hash,
  });
}

function makeInvoice(id: string, amountCents: number): InvoiceMatchCandidate {
  return {
    id,
    supplierId: "sup-galp",
    supplierName: "Galp Energia",
    invoiceNumber: `FT 2026/${id}`,
    totalWithVat: amountCents,
    invoiceDate: "2026-07-01",
    dueDate: "2026-07-31",
    paidAt: null,
    status: "pending",
  };
}

function makePayable(id: string, amountCents: number): PayableEntryMatchCandidate {
  return {
    id,
    supplierId: "sup-x",
    supplierName: "Fornecedor X",
    description: "Serviço Y",
    amount: amountCents,
    dueDate: "2026-07-31",
    status: "pending",
    invoiceId: null,
  };
}

describe("ReconcileMovementUseCase", () => {
  let repo: FakeBankMovementRepository;
  let hint: FakeMovementMatchHint;
  let invoiceRead: FakeInvoiceMatchRead;
  let payableRead: FakePayableEntryMatchRead;
  let linkRepo: FakeBankMovementEntityLinkRepository;
  let useCase: ReconcileMovementUseCase;
  let movement: BankMovement;

  beforeEach(async () => {
    repo = new FakeBankMovementRepository();
    hint = new FakeMovementMatchHint();
    invoiceRead = new FakeInvoiceMatchRead();
    payableRead = new FakePayableEntryMatchRead();
    linkRepo = new FakeBankMovementEntityLinkRepository();
    useCase = new ReconcileMovementUseCase(repo, hint, invoiceRead, payableRead, linkRepo);
    movement = makeDebit(70_000);
    await repo.saveBulk([movement]);
  });

  it("throws MovementNotFoundError for unknown id", async () => {
    invoiceRead.setcandidates([makeInvoice("inv-1", 70_000)]);
    await expect(
      useCase.execute({
        movementId: "not-found",
        entityLinks: [{ entityType: "invoice", entityId: "inv-1" }],
      })
    ).rejects.toThrow(MovementNotFoundError);
  });

  it("single invoice exact match → conciliado_com_fatura", async () => {
    invoiceRead.setcandidates([makeInvoice("inv-42", 70_000)]);

    await useCase.execute({
      movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-42" }],
    });

    const updated = await repo.findById(movement.id);
    expect(updated!.reconciliationStatus).toBe("conciliado_com_fatura");
    expect(updated!.reconciliationAmountDiff).toBeNull();
    expect(updated!.isResolved).toBe(true);

    const links = linkRepo.all();
    expect(links).toHaveLength(1);
    expect(links[0]!.entityId).toBe("inv-42");
    expect(links[0]!.amountCents).toBe(70_000);
  });

  it("single payable_entry exact match → conciliado_com_fatura", async () => {
    payableRead.setCandidates([makePayable("pe-7", 70_000)]);

    await useCase.execute({
      movementId: movement.id,
      entityLinks: [{ entityType: "payable_entry", entityId: "pe-7" }],
    });

    const updated = await repo.findById(movement.id);
    expect(updated!.reconciliationStatus).toBe("conciliado_com_fatura");
    expect(updated!.isResolved).toBe(true);

    const links = linkRepo.all();
    expect(links).toHaveLength(1);
    expect(links[0]!.entityId).toBe("pe-7");
  });

  it("two invoices summing exactly to movement → conciliado_com_fatura", async () => {
    invoiceRead.setcandidates([
      makeInvoice("inv-1", 40_000),
      makeInvoice("inv-2", 30_000),
    ]);

    await useCase.execute({
      movementId: movement.id,
      entityLinks: [
        { entityType: "invoice", entityId: "inv-1" },
        { entityType: "invoice", entityId: "inv-2" },
      ],
    });

    const updated = await repo.findById(movement.id);
    expect(updated!.reconciliationStatus).toBe("conciliado_com_fatura");
    expect(updated!.reconciliationAmountDiff).toBeNull();

    const links = linkRepo.all();
    expect(links).toHaveLength(2);
  });

  it("two invoices summing less than movement (diff > 100 cts) → conciliado_parcial", async () => {
    invoiceRead.setcandidates([
      makeInvoice("inv-1", 40_000),
      makeInvoice("inv-2", 28_000), // total 68_000, diff = 2_000
    ]);

    await useCase.execute({
      movementId: movement.id,
      entityLinks: [
        { entityType: "invoice", entityId: "inv-1" },
        { entityType: "invoice", entityId: "inv-2" },
      ],
    });

    const updated = await repo.findById(movement.id);
    expect(updated!.reconciliationStatus).toBe("conciliado_parcial");
    expect(updated!.reconciliationAmountDiff).toBe(2_000); // 70_000 - 68_000
    expect(updated!.isResolved).toBe(false);
  });

  it("within tolerance (diff ≤ 100 cts) → conciliado_com_fatura", async () => {
    invoiceRead.setcandidates([makeInvoice("inv-1", 69_950)]); // diff = 50

    await useCase.execute({
      movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-1" }],
    });

    const updated = await repo.findById(movement.id);
    expect(updated!.reconciliationStatus).toBe("conciliado_com_fatura");
    expect(updated!.reconciliationAmountDiff).toBeNull();
  });

  it("re-reconciling clears old links and saves new ones", async () => {
    invoiceRead.setcandidates([makeInvoice("inv-1", 70_000), makeInvoice("inv-2", 70_000)]);

    await useCase.execute({
      movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-1" }],
    });
    expect(linkRepo.all()).toHaveLength(1);

    await useCase.execute({
      movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-2" }],
    });
    const links = linkRepo.all();
    expect(links).toHaveLength(1);
    expect(links[0]!.entityId).toBe("inv-2");
  });

  it("saves hint when single-entity full match and supplierId provided", async () => {
    invoiceRead.setcandidates([makeInvoice("inv-1", 70_000)]);

    await useCase.execute({
      movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-1", supplierId: "sup-galp" }],
    });

    expect(hint.savedCalls).toHaveLength(1);
    expect(hint.savedCalls[0]!.supplierId).toBe("sup-galp");
    expect(hint.savedCalls[0]!.normalizedDesc).toContain("galp");
  });

  it("does not save hint for multi-entity reconciliation", async () => {
    invoiceRead.setcandidates([makeInvoice("inv-1", 35_000), makeInvoice("inv-2", 35_000)]);

    await useCase.execute({
      movementId: movement.id,
      entityLinks: [
        { entityType: "invoice", entityId: "inv-1", supplierId: "sup-galp" },
        { entityType: "invoice", entityId: "inv-2", supplierId: "sup-galp" },
      ],
    });

    expect(hint.savedCalls).toHaveLength(0);
  });

  it("does not save hint for partial reconciliation", async () => {
    invoiceRead.setcandidates([makeInvoice("inv-1", 50_000)]); // diff = 20_000

    await useCase.execute({
      movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-1", supplierId: "sup-galp" }],
    });

    expect(hint.savedCalls).toHaveLength(0);
  });

  it("does not save hint when supplierId is absent", async () => {
    invoiceRead.setcandidates([makeInvoice("inv-1", 70_000)]);

    await useCase.execute({
      movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-1" }],
    });

    expect(hint.savedCalls).toHaveLength(0);
  });

  it("throws when entityLinks is empty", async () => {
    await expect(
      useCase.execute({ movementId: movement.id, entityLinks: [] })
    ).rejects.toThrow("At least one entity link is required");
  });

  it("throws when invoice not found in adapter", async () => {
    invoiceRead.setcandidates([]); // no invoices

    await expect(
      useCase.execute({
        movementId: movement.id,
        entityLinks: [{ entityType: "invoice", entityId: "inv-ghost" }],
      })
    ).rejects.toThrow("Invoice not found: inv-ghost");
  });

  it("throws EntityAlreadyReconciledError when payable_entry is already linked to another movement", async () => {
    const otherMovement = makeDebit(70_000, "hash-other");
    await repo.saveBulk([otherMovement]);
    payableRead.setCandidates([makePayable("pe-taken", 70_000)]);

    await useCase.execute({
      movementId: otherMovement.id,
      entityLinks: [{ entityType: "payable_entry", entityId: "pe-taken" }],
    });

    await expect(
      useCase.execute({
        movementId: movement.id,
        entityLinks: [{ entityType: "payable_entry", entityId: "pe-taken" }],
      })
    ).rejects.toThrow(EntityAlreadyReconciledError);
  });

  it("throws EntityAlreadyReconciledError when invoice is already linked to another movement", async () => {
    const otherMovement = makeDebit(70_000, "hash-other");
    await repo.saveBulk([otherMovement]);
    invoiceRead.setcandidates([makeInvoice("inv-taken", 70_000)]);

    // Reconcile the other movement with inv-taken first
    await useCase.execute({
      movementId: otherMovement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-taken" }],
    });

    // Now try to reconcile movement with the same invoice → should fail
    await expect(
      useCase.execute({
        movementId: movement.id,
        entityLinks: [{ entityType: "invoice", entityId: "inv-taken" }],
      })
    ).rejects.toThrow(EntityAlreadyReconciledError);
  });

  it("allows re-reconciling the same movement with its own invoice", async () => {
    invoiceRead.setcandidates([makeInvoice("inv-1", 70_000), makeInvoice("inv-2", 70_000)]);

    // First reconciliation
    await useCase.execute({
      movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-1" }],
    });

    // Re-reconcile with a different invoice — should succeed (replaces old link)
    await expect(
      useCase.execute({
        movementId: movement.id,
        entityLinks: [{ entityType: "invoice", entityId: "inv-2" }],
      })
    ).resolves.toBeUndefined();

    expect(linkRepo.all()).toHaveLength(1);
    expect(linkRepo.all()[0]!.entityId).toBe("inv-2");
  });
});
