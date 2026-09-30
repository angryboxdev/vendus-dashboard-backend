import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId, type OrganizationId } from "../../../../kernel/organization-id.js";
import { GetGroupedSettlementSuggestionsUseCase } from "../../application/use-cases/get-grouped-settlement-suggestions.use-case.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeMovementMatchHint } from "../fakes/fake-movement-match-hint.js";
import { FakeInvoiceMatchRead } from "../fakes/fake-invoice-match-read.js";
import { FakeBankMovementEntityLinkRepository } from "../fakes/fake-bank-movement-entity-link-repository.js";
import { FakeSupplierNameRead } from "../fakes/fake-supplier-name-read.js";
import { MovementNotFoundError } from "../../domain/errors.js";
import type { InvoiceMatchCandidate } from "../../domain/ports/out/invoice-match-read.port.js";
import type {
  FindMovementCandidatesPort,
  FindMovementCandidatesQuery,
  MovementCandidate,
} from "../../domain/ports/in/bank-statement.ports.js";

class FakeFindMovementCandidates implements FindMovementCandidatesPort {
  result: MovementCandidate[] = [];
  calls: FindMovementCandidatesQuery[] = [];

  async execute(query: FindMovementCandidatesQuery): Promise<MovementCandidate[]> {
    this.calls.push(query);
    return this.result;
  }
}

function makeDebit(amountCents: number, description = "TRF P/ JUSTDRINKS LDA"): BankMovement {
  return BankMovement.create({
    statementImportId: "stmt-1",
    bookingDate: new Date("2026-06-15"),
    valueDate: new Date("2026-06-15"),
    description,
    amount: amountCents,
    balanceAfter: 0,
    movementType: "debit",
    deduplicationHash: `hash-${amountCents}-${description}`,
  });
}

function makeInvoice(overrides: Partial<InvoiceMatchCandidate> & Pick<InvoiceMatchCandidate, "id" | "totalWithVat">): InvoiceMatchCandidate {
  return {
    supplierId: "sup-justdrinks",
    supplierName: "Justdrinks Lda",
    invoiceNumber: `FT-${overrides.id}`,
    invoiceDate: "2026-05-01",
    dueDate: "2026-05-15",
    paidAt: null,
    status: "pending",
    currency: "EUR",
    documentType: "invoice",
    ...overrides,
  };
}

describe("GetGroupedSettlementSuggestionsUseCase", () => {
  const organizationId = mintOrganizationId("org-a");
  let movementRepo: FakeBankMovementRepository;
  let findCandidates: FakeFindMovementCandidates;
  let hint: FakeMovementMatchHint;
  let invoiceRead: FakeInvoiceMatchRead;
  let linkRepo: FakeBankMovementEntityLinkRepository;
  let supplierNameRead: FakeSupplierNameRead;
  let useCase: GetGroupedSettlementSuggestionsUseCase;

  beforeEach(() => {
    movementRepo = new FakeBankMovementRepository();
    findCandidates = new FakeFindMovementCandidates();
    hint = new FakeMovementMatchHint();
    invoiceRead = new FakeInvoiceMatchRead();
    linkRepo = new FakeBankMovementEntityLinkRepository();
    supplierNameRead = new FakeSupplierNameRead();
    useCase = new GetGroupedSettlementSuggestionsUseCase(movementRepo, findCandidates, hint, invoiceRead, linkRepo, supplierNameRead);
  });

  it("throws MovementNotFoundError for an unknown movement", async () => {
    await expect(
      useCase.execute({ organizationId, movementId: "ghost" })
    ).rejects.toThrow(MovementNotFoundError);
  });

  it("returns the simple 1:1 match when one exists, without running combinatorics", async () => {
    const movement = makeDebit(70_000);
    await movementRepo.saveBulk(organizationId, [movement]);
    findCandidates.result = [
      {
        entityType: "invoice",
        entityId: "inv-1",
        entityLabel: "Justdrinks Lda — FT-1",
        supplierId: "sup-justdrinks",
        amountCents: 70_000,
        openBalanceCents: 70_000,
        date: "2026-05-01",
        confidence: 0.9,
      },
    ];

    const result = await useCase.execute({ organizationId, movementId: movement.id });

    expect(result.singleExactMatch).not.toBeNull();
    expect(result.singleExactMatch!.entityId).toBe("inv-1");
    expect(result.primaryCombination).toBeNull();
    expect(result.alternateCombinations).toEqual([]);
  });

  it("returns no supplier identified when the hint is absent and no candidates were found", async () => {
    const movement = makeDebit(70_000, "COM.MAN.CONTA");
    await movementRepo.saveBulk(organizationId, [movement]);
    findCandidates.result = [];

    const result = await useCase.execute({ organizationId, movementId: movement.id });

    expect(result.supplierId).toBeNull();
    expect(result.singleExactMatch).toBeNull();
    expect(result.primaryCombination).toBeNull();
    expect(result.eligibleDocuments).toEqual([]);
  });

  it("finds a grouped exact-sum combination via supplier hint when no simple match exists", async () => {
    const movement = makeDebit(60_000); // 40_000 + 20_000
    await movementRepo.saveBulk(organizationId, [movement]);
    hint.setHint(organizationId, "trf justdrinks lda", "sup-justdrinks");
    findCandidates.result = []; // no single-doc match

    invoiceRead.setcandidates(organizationId, [
      makeInvoice({ id: "inv-1", totalWithVat: 40_000 }),
      makeInvoice({ id: "inv-2", totalWithVat: 20_000 }),
      makeInvoice({ id: "inv-decoy", totalWithVat: 999_999 }),
    ]);

    const result = await useCase.execute({ organizationId, movementId: movement.id });

    expect(result.supplierId).toBe("sup-justdrinks");
    expect(result.singleExactMatch).toBeNull();
    expect(result.primaryCombination).not.toBeNull();
    expect(result.primaryCombination!.netTotalCents).toBe(60_000);
    expect(result.primaryCombination!.invoiceCount).toBe(2);
    expect(result.primaryCombination!.creditNoteCount).toBe(0);
    const ids = result.primaryCombination!.docs.map((d) => d.entityId).sort();
    expect(ids).toEqual(["inv-1", "inv-2"]);
  });

  it("finds a grouped combination via supplier-name fallback when there's no hint AND no single candidate (real-world bug: grouped scenarios never have a near-amount candidate to infer supplier from)", async () => {
    const movement = makeDebit(60_000, "TRF P/ JUSTDRINKS LDA"); // 40_000 + 20_000
    await movementRepo.saveBulk(organizationId, [movement]);
    // No hint learned yet, no single-doc candidate near this amount at all —
    // this is exactly the state a brand-new grouped-settlement movement is
    // in, and the only remaining signal is matching the supplier's own name
    // against the bank description directly (never via an amount-matched
    // candidate, since none exists).
    findCandidates.result = [];
    supplierNameRead.setSuppliers(organizationId, [
      { id: "sup-other", name: "Outro Fornecedor Lda" },
      { id: "sup-justdrinks", name: "Justdrinks Lda" },
    ]);

    invoiceRead.setcandidates(organizationId, [
      makeInvoice({ id: "inv-1", totalWithVat: 40_000 }),
      makeInvoice({ id: "inv-2", totalWithVat: 20_000 }),
    ]);

    const result = await useCase.execute({ organizationId, movementId: movement.id });

    expect(result.supplierId).toBe("sup-justdrinks");
    expect(result.primaryCombination).not.toBeNull();
    expect(result.primaryCombination!.netTotalCents).toBe(60_000);
  });

  it("includes a credit note in the combination, tagged distinctly and negatively valued", async () => {
    const movement = makeDebit(80_000); // 40_000 + 60_000 - 20_000
    await movementRepo.saveBulk(organizationId, [movement]);
    hint.setHint(organizationId, "trf justdrinks lda", "sup-justdrinks");
    findCandidates.result = [];

    invoiceRead.setcandidates(organizationId, [
      makeInvoice({ id: "inv-1", totalWithVat: 40_000 }),
      makeInvoice({ id: "inv-2", totalWithVat: 60_000 }),
      makeInvoice({ id: "cn-1", totalWithVat: -20_000, documentType: "credit_note" }),
    ]);

    const result = await useCase.execute({ organizationId, movementId: movement.id });

    expect(result.primaryCombination).not.toBeNull();
    const cn = result.primaryCombination!.docs.find((d) => d.entityId === "cn-1")!;
    expect(cn.documentType).toBe("credit_note");
    expect(cn.openBalanceCents).toBeLessThan(0);
    expect(result.primaryCombination!.creditNoteTotalCents).toBe(-20_000);
    expect(result.primaryCombination!.invoiceTotalCents).toBe(100_000);
  });

  it("never re-offers a fully-settled document's original total — excludes it entirely", async () => {
    const movement = makeDebit(40_000);
    await movementRepo.saveBulk(organizationId, [movement]);
    hint.setHint(organizationId, "trf justdrinks lda", "sup-justdrinks");
    findCandidates.result = [];

    invoiceRead.setcandidates(organizationId, [
      makeInvoice({ id: "inv-settled", totalWithVat: 50_000 }),
      makeInvoice({ id: "inv-open", totalWithVat: 40_000 }),
    ]);
    // inv-settled fully allocated by another movement — open balance = 0.
    await linkRepo.saveAll(organizationId, [
      {
        id: "link-1",
        movementId: "other-movement",
        entityType: "invoice",
        entityId: "inv-settled",
        amountCents: 50_000,
        allocatedAmountCents: 50_000,
        entityLabel: "x",
      },
    ]);

    const result = await useCase.execute({ organizationId, movementId: movement.id });

    expect(result.eligibleDocuments.map((d) => d.entityId)).not.toContain("inv-settled");
    expect(result.eligibleDocuments.map((d) => d.entityId)).toContain("inv-open");
  });

  it("shows only the remaining open balance for a partially-settled document, never the original total", async () => {
    const movement = makeDebit(30_000);
    await movementRepo.saveBulk(organizationId, [movement]);
    hint.setHint(organizationId, "trf justdrinks lda", "sup-justdrinks");
    findCandidates.result = [];

    invoiceRead.setcandidates(organizationId, [
      makeInvoice({ id: "inv-partial", totalWithVat: 100_000 }), // 100_000 total, 70_000 already allocated elsewhere
    ]);
    await linkRepo.saveAll(organizationId, [
      {
        id: "link-1",
        movementId: "other-movement",
        entityType: "invoice",
        entityId: "inv-partial",
        amountCents: 100_000,
        allocatedAmountCents: 70_000,
        entityLabel: "x",
      },
    ]);

    const result = await useCase.execute({ organizationId, movementId: movement.id });

    const doc = result.eligibleDocuments.find((d) => d.entityId === "inv-partial")!;
    expect(doc.openBalanceCents).toBe(30_000); // remaining balance, never the 100_000 original total
    expect(result.primaryCombination!.docs.map((d) => d.entityId)).toEqual(["inv-partial"]);
  });

  it("never combines documents from a different supplier, even when the sum coincidentally matches", async () => {
    const movement = makeDebit(50_000);
    await movementRepo.saveBulk(organizationId, [movement]);
    hint.setHint(organizationId, "trf justdrinks lda", "sup-justdrinks");
    findCandidates.result = [];

    invoiceRead.setcandidates(organizationId, [
      makeInvoice({ id: "inv-1", totalWithVat: 30_000 }),
      // Different supplier — even though 30_000 + 20_000 = 50_000, findBySupplier
      // (scoped to sup-justdrinks) never returns this one at all.
      makeInvoice({ id: "inv-other-supplier", totalWithVat: 20_000, supplierId: "sup-other" }),
    ]);

    const result = await useCase.execute({ organizationId, movementId: movement.id });

    expect(result.eligibleDocuments.map((d) => d.entityId)).not.toContain("inv-other-supplier");
    expect(result.primaryCombination).toBeNull();
  });

  it("never combines documents in a different currency, even when the sum coincidentally matches", async () => {
    const movement = makeDebit(50_000);
    await movementRepo.saveBulk(organizationId, [movement]); // EUR by default
    hint.setHint(organizationId, "trf justdrinks lda", "sup-justdrinks");
    findCandidates.result = [];

    invoiceRead.setcandidates(organizationId, [
      makeInvoice({ id: "inv-1", totalWithVat: 30_000 }),
      makeInvoice({ id: "inv-usd", totalWithVat: 20_000, currency: "USD" }),
    ]);

    const result = await useCase.execute({ organizationId, movementId: movement.id });

    expect(result.eligibleDocuments.map((d) => d.entityId)).not.toContain("inv-usd");
    expect(result.primaryCombination).toBeNull();
  });

  it("surfaces multiple exact combinations without silently picking one", async () => {
    const movement = makeDebit(10_000);
    await movementRepo.saveBulk(organizationId, [movement]);
    hint.setHint(organizationId, "trf justdrinks lda", "sup-justdrinks");
    findCandidates.result = [];

    invoiceRead.setcandidates(organizationId, [
      makeInvoice({ id: "inv-a", totalWithVat: 5_000 }),
      makeInvoice({ id: "inv-b", totalWithVat: 5_000 }),
      makeInvoice({ id: "inv-c", totalWithVat: 10_000 }),
    ]);

    const result = await useCase.execute({ organizationId, movementId: movement.id });

    expect(result.primaryCombination).not.toBeNull();
    expect(result.alternateCombinations.length).toBeGreaterThan(0);
  });
});
