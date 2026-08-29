import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ReconcileMovementUseCase } from "../../application/use-cases/reconcile-movement.use-case.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeMovementMatchHint } from "../fakes/fake-movement-match-hint.js";
import { FakeInvoiceMatchRead } from "../fakes/fake-invoice-match-read.js";
import { FakePayableEntryMatchRead } from "../fakes/fake-payable-entry-match-read.js";
import { FakeBankMovementEntityLinkRepository } from "../fakes/fake-bank-movement-entity-link-repository.js";
import { FakeInvoiceReconciliationWrite } from "../fakes/fake-invoice-reconciliation-write.js";
import { MovementNotFoundError } from "../../domain/errors.js";
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
  const organizationId = mintOrganizationId("org-a");
  let repo: FakeBankMovementRepository;
  let hint: FakeMovementMatchHint;
  let invoiceRead: FakeInvoiceMatchRead;
  let payableRead: FakePayableEntryMatchRead;
  let linkRepo: FakeBankMovementEntityLinkRepository;
  let invoiceReconWrite: FakeInvoiceReconciliationWrite;
  let useCase: ReconcileMovementUseCase;
  let movement: BankMovement;

  beforeEach(async () => {
    repo = new FakeBankMovementRepository();
    hint = new FakeMovementMatchHint();
    invoiceRead = new FakeInvoiceMatchRead();
    payableRead = new FakePayableEntryMatchRead();
    linkRepo = new FakeBankMovementEntityLinkRepository();
    invoiceReconWrite = new FakeInvoiceReconciliationWrite();
    useCase = new ReconcileMovementUseCase(repo, hint, invoiceRead, payableRead, linkRepo, invoiceReconWrite);
    movement = makeDebit(70_000);
    await repo.saveBulk(organizationId, [movement]);
  });

  it("throws MovementNotFoundError for unknown id", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-1", 70_000)]);
    await expect(
      useCase.execute({ organizationId, movementId: "not-found",
        entityLinks: [{ entityType: "invoice", entityId: "inv-1", allocatedAmountCents: 70_000 }],
      })
    ).rejects.toThrow(MovementNotFoundError);
  });

  it("single invoice exact match → conciliado_com_fatura", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-42", 70_000)]);

    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-42", allocatedAmountCents: 70_000 }],
    });

    const updated = await repo.findById(organizationId, movement.id);
    expect(updated!.reconciliationStatus).toBe("conciliado_com_fatura");
    expect(updated!.reconciliationAmountDiff).toBeNull();
    expect(updated!.isResolved).toBe(true);

    const links = linkRepo.all(organizationId);
    expect(links).toHaveLength(1);
    expect(links[0]!.entityId).toBe("inv-42");
    expect(links[0]!.amountCents).toBe(70_000);
    expect(links[0]!.allocatedAmountCents).toBe(70_000);
  });

  it("single payable_entry exact match → conciliado_com_fatura", async () => {
    payableRead.setCandidates(organizationId, [makePayable("pe-7", 70_000)]);

    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [{ entityType: "payable_entry", entityId: "pe-7", allocatedAmountCents: 70_000 }],
    });

    const updated = await repo.findById(organizationId, movement.id);
    expect(updated!.reconciliationStatus).toBe("conciliado_com_fatura");
    expect(updated!.isResolved).toBe(true);

    const links = linkRepo.all(organizationId);
    expect(links).toHaveLength(1);
    expect(links[0]!.entityId).toBe("pe-7");
    expect(links[0]!.allocatedAmountCents).toBe(70_000);
  });

  it("two invoices allocated to exactly match movement → conciliado_com_fatura", async () => {
    invoiceRead.setcandidates(organizationId, [
      makeInvoice("inv-1", 40_000),
      makeInvoice("inv-2", 30_000),
    ]);

    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [
        { entityType: "invoice", entityId: "inv-1", allocatedAmountCents: 40_000 },
        { entityType: "invoice", entityId: "inv-2", allocatedAmountCents: 30_000 },
      ],
    });

    const updated = await repo.findById(organizationId, movement.id);
    expect(updated!.reconciliationStatus).toBe("conciliado_com_fatura");
    expect(updated!.reconciliationAmountDiff).toBeNull();

    const links = linkRepo.all(organizationId);
    expect(links).toHaveLength(2);
  });

  it("movement partially allocated (diff > 100 cts) → conciliado_parcial", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-1", 100_000)]);

    await useCase.execute({ organizationId, movementId: movement.id,
      // Allocating only 68_000 out of 70_000 movement
      entityLinks: [{ entityType: "invoice", entityId: "inv-1", allocatedAmountCents: 68_000 }],
    });

    const updated = await repo.findById(organizationId, movement.id);
    expect(updated!.reconciliationStatus).toBe("conciliado_parcial");
    expect(updated!.reconciliationAmountDiff).toBe(2_000); // 70_000 - 68_000
  });

  it("within tolerance (diff ≤ 100 cts) → conciliado_com_fatura", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-1", 70_000)]);

    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-1", allocatedAmountCents: 69_950 }],
    });

    const updated = await repo.findById(organizationId, movement.id);
    expect(updated!.reconciliationStatus).toBe("conciliado_com_fatura");
    expect(updated!.reconciliationAmountDiff).toBeNull();
  });

  it("partial payment to invoice — invoice keeps open balance", async () => {
    // Invoice total = 100_000, we pay 70_000 (the movement amount)
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-big", 100_000)]);

    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-big", allocatedAmountCents: 70_000 }],
    });

    const updated = await repo.findById(organizationId, movement.id);
    // Movement fully used (diff = 0 → conciliado_com_fatura)
    expect(updated!.reconciliationStatus).toBe("conciliado_com_fatura");
    expect(updated!.reconciliationAmountDiff).toBeNull();

    const links = linkRepo.all(organizationId);
    expect(links[0]!.allocatedAmountCents).toBe(70_000);
    expect(links[0]!.amountCents).toBe(100_000); // entity total preserved
  });

  it("N:1 — two movements can allocate to the same invoice", async () => {
    const movement2 = makeDebit(30_000, "hash-2");
    await repo.saveBulk(organizationId, [movement2]);
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-shared", 100_000)]);

    // First movement allocates 70_000
    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-shared", allocatedAmountCents: 70_000 }],
    });

    // Second movement allocates the remaining 30_000
    await useCase.execute({ organizationId, movementId: movement2.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-shared", allocatedAmountCents: 30_000 }],
    });

    const links = linkRepo.all(organizationId);
    expect(links).toHaveLength(2);
    const totalAllocated = links.reduce((s, l) => s + l.allocatedAmountCents, 0);
    expect(totalAllocated).toBe(100_000);
  });

  it("throws when allocated amount exceeds invoice open balance", async () => {
    const movement2 = makeDebit(40_000, "hash-2");
    await repo.saveBulk(organizationId, [movement2]);
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-small", 70_000)]);

    // First movement takes 70_000 (full invoice)
    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-small", allocatedAmountCents: 70_000 }],
    });

    // Second movement tries to allocate 40_000 but invoice is fully paid (open balance = 0)
    await expect(
      useCase.execute({ organizationId, movementId: movement2.id,
        entityLinks: [{ entityType: "invoice", entityId: "inv-small", allocatedAmountCents: 40_000 }],
      })
    ).rejects.toThrow(/exceeds open balance/);
  });

  it("throws when total allocated exceeds movement amount", async () => {
    invoiceRead.setcandidates(organizationId, [
      makeInvoice("inv-1", 50_000),
      makeInvoice("inv-2", 50_000),
    ]);

    await expect(
      useCase.execute({ organizationId, movementId: movement.id,
        entityLinks: [
          { entityType: "invoice", entityId: "inv-1", allocatedAmountCents: 50_000 },
          { entityType: "invoice", entityId: "inv-2", allocatedAmountCents: 50_000 },
          // total = 100_000, movement = 70_000
        ],
      })
    ).rejects.toThrow(/exceeds movement amount/);
  });

  it("throws when allocatedAmountCents is zero or negative", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-1", 70_000)]);

    await expect(
      useCase.execute({ organizationId, movementId: movement.id,
        entityLinks: [{ entityType: "invoice", entityId: "inv-1", allocatedAmountCents: 0 }],
      })
    ).rejects.toThrow(/allocatedAmountCents must be positive/);
  });

  it("re-reconciling clears old links and saves new ones", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-1", 70_000), makeInvoice("inv-2", 70_000)]);

    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-1", allocatedAmountCents: 70_000 }],
    });
    expect(linkRepo.all(organizationId)).toHaveLength(1);

    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-2", allocatedAmountCents: 70_000 }],
    });
    const links = linkRepo.all(organizationId);
    expect(links).toHaveLength(1);
    expect(links[0]!.entityId).toBe("inv-2");
  });

  it("allows re-reconciling the same movement to the same invoice with a different amount", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-1", 100_000)]);

    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-1", allocatedAmountCents: 60_000 }],
    });

    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-1", allocatedAmountCents: 70_000 }],
    });

    const links = linkRepo.all(organizationId);
    expect(links).toHaveLength(1);
    expect(links[0]!.allocatedAmountCents).toBe(70_000);
  });

  it("saves hint when single-entity full-movement match and supplierId provided", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-1", 70_000)]);

    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-1", allocatedAmountCents: 70_000, supplierId: "sup-galp" }],
    });

    expect(hint.savedCalls).toHaveLength(1);
    expect(hint.savedCalls[0]!.supplierId).toBe("sup-galp");
    expect(hint.savedCalls[0]!.normalizedDesc).toContain("galp");
  });

  it("does not save hint for multi-entity reconciliation", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-1", 35_000), makeInvoice("inv-2", 35_000)]);

    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [
        { entityType: "invoice", entityId: "inv-1", allocatedAmountCents: 35_000, supplierId: "sup-galp" },
        { entityType: "invoice", entityId: "inv-2", allocatedAmountCents: 35_000, supplierId: "sup-galp" },
      ],
    });

    expect(hint.savedCalls).toHaveLength(0);
  });

  it("does not save hint when movement is not fully allocated", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-1", 100_000)]);

    await useCase.execute({ organizationId, movementId: movement.id,
      // 50_000 allocated, 20_000 unallocated → partial
      entityLinks: [{ entityType: "invoice", entityId: "inv-1", allocatedAmountCents: 50_000, supplierId: "sup-galp" }],
    });

    expect(hint.savedCalls).toHaveLength(0);
  });

  it("does not save hint when supplierId is absent", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-1", 70_000)]);

    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-1", allocatedAmountCents: 70_000 }],
    });

    expect(hint.savedCalls).toHaveLength(0);
  });

  it("throws when entityLinks is empty", async () => {
    await expect(
      useCase.execute({ organizationId, movementId: movement.id, entityLinks: [] })
    ).rejects.toThrow("At least one entity link is required");
  });

  it("throws when invoice not found in adapter", async () => {
    invoiceRead.setcandidates(organizationId, []); // no invoices

    await expect(
      useCase.execute({ organizationId, movementId: movement.id,
        entityLinks: [{ entityType: "invoice", entityId: "inv-ghost", allocatedAmountCents: 70_000 }],
      })
    ).rejects.toThrow("Invoice not found: inv-ghost");
  });

  it("throws when payable_entry not found in adapter", async () => {
    payableRead.setCandidates(organizationId, []); // no payables

    await expect(
      useCase.execute({ organizationId, movementId: movement.id,
        entityLinks: [{ entityType: "payable_entry", entityId: "pe-ghost", allocatedAmountCents: 70_000 }],
      })
    ).rejects.toThrow("Payable entry not found: pe-ghost");
  });

  // ── Invoice reconciliation status propagation ──────────────────────────────

  it("full reconciliation → markReconciled called with movement bookingDate", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-1", 70_000)]);

    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-1", allocatedAmountCents: 70_000 }],
    });

    expect(invoiceReconWrite.reconciledCalls).toHaveLength(1);
    expect(invoiceReconWrite.reconciledCalls[0]!.invoiceId).toBe("inv-1");
    expect(invoiceReconWrite.reconciledCalls[0]!.movementDate).toEqual(movement.bookingDate);
    expect(invoiceReconWrite.partialCalls).toHaveLength(0);
    expect(invoiceReconWrite.unreconciledCalls).toHaveLength(0);
  });

  it("partial reconciliation (allocated < invoice total) → markPartiallyReconciled called", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-1", 100_000)]);

    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-1", allocatedAmountCents: 70_000 }],
    });

    expect(invoiceReconWrite.partialCalls).toContain("inv-1");
    expect(invoiceReconWrite.reconciledCalls).toHaveLength(0);
  });

  it("re-reconciliation removes invoice → markUnreconciled called on old invoice", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-1", 70_000), makeInvoice("inv-2", 70_000)]);

    // First reconciliation: inv-1
    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-1", allocatedAmountCents: 70_000 }],
    });
    invoiceReconWrite.reset();

    // Re-reconciliation: switch to inv-2
    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-2", allocatedAmountCents: 70_000 }],
    });

    expect(invoiceReconWrite.unreconciledCalls).toContain("inv-1");
    expect(invoiceReconWrite.reconciledCalls.map((c) => c.invoiceId)).toContain("inv-2");
  });

  it("re-reconciliation trades invoices → old unreconciled, new reconciled", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-old", 70_000), makeInvoice("inv-new", 70_000)]);

    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-old", allocatedAmountCents: 70_000 }],
    });
    invoiceReconWrite.reset();

    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [{ entityType: "invoice", entityId: "inv-new", allocatedAmountCents: 70_000 }],
    });

    expect(invoiceReconWrite.unreconciledCalls).toContain("inv-old");
    expect(invoiceReconWrite.reconciledCalls.map((c) => c.invoiceId)).toContain("inv-new");
  });

  it("mixed invoice + payable_entry in the same reconciliation", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-1", 40_000)]);
    payableRead.setCandidates(organizationId, [makePayable("pe-1", 30_000)]);

    await useCase.execute({ organizationId, movementId: movement.id,
      entityLinks: [
        { entityType: "invoice", entityId: "inv-1", allocatedAmountCents: 40_000 },
        { entityType: "payable_entry", entityId: "pe-1", allocatedAmountCents: 30_000 },
      ],
    });

    const updated = await repo.findById(organizationId, movement.id);
    expect(updated!.reconciliationStatus).toBe("conciliado_com_fatura");

    const links = linkRepo.all(organizationId);
    expect(links).toHaveLength(2);
    expect(links.find((l) => l.entityType === "invoice")!.allocatedAmountCents).toBe(40_000);
    expect(links.find((l) => l.entityType === "payable_entry")!.allocatedAmountCents).toBe(30_000);
  });
});
