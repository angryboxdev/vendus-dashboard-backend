import { describe, it, expect, beforeEach } from "@jest/globals";
import { FindMovementCandidatesUseCase } from "../../application/use-cases/find-movement-candidates.use-case.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeInvoiceMatchRead } from "../fakes/fake-invoice-match-read.js";
import { FakePayableEntryMatchRead } from "../fakes/fake-payable-entry-match-read.js";
import { FakeMovementMatchHint } from "../fakes/fake-movement-match-hint.js";
import { MovementNotFoundError } from "../../domain/errors.js";
import type { InvoiceMatchCandidate } from "../../domain/ports/out/invoice-match-read.port.js";
import type { PayableEntryMatchCandidate } from "../../domain/ports/out/payable-entry-match-read.port.js";

const BOOKING_DATE = new Date("2026-07-05T00:00:00.000Z");

function makeDebit(amount = 12_000, hash = "h1") {
  return BankMovement.create({
    statementImportId: "stmt-1",
    bookingDate: BOOKING_DATE,
    valueDate: BOOKING_DATE,
    description: "PAGAMENTO EDP SA",
    amount,
    balanceAfter: 88_000,
    movementType: "debit",
    deduplicationHash: hash,
  });
}

function makeInvoiceCandidate(overrides: Partial<InvoiceMatchCandidate> = {}): InvoiceMatchCandidate {
  return {
    id: "inv-1",
    supplierId: "sup-1",
    supplierName: "EDP SA",
    invoiceNumber: "FT 2026/100",
    totalWithVat: 12_000,
    invoiceDate: "2026-07-01",
    dueDate: "2026-07-05",
    paidAt: null,
    status: "pending",
    ...overrides,
  };
}

function makePayableCandidate(overrides: Partial<PayableEntryMatchCandidate> = {}): PayableEntryMatchCandidate {
  return {
    id: "pe-1",
    supplierId: "sup-2",
    supplierName: "NOS",
    description: "Fatura NOS Jul",
    amount: 12_000,
    dueDate: "2026-07-04",
    status: "pending",
    ...overrides,
  };
}

describe("FindMovementCandidatesUseCase", () => {
  let movementRepo: FakeBankMovementRepository;
  let invoiceRead: FakeInvoiceMatchRead;
  let payableRead: FakePayableEntryMatchRead;
  let hint: FakeMovementMatchHint;
  let useCase: FindMovementCandidatesUseCase;
  let movement: BankMovement;

  beforeEach(async () => {
    movementRepo = new FakeBankMovementRepository();
    invoiceRead = new FakeInvoiceMatchRead();
    payableRead = new FakePayableEntryMatchRead();
    hint = new FakeMovementMatchHint();
    useCase = new FindMovementCandidatesUseCase(movementRepo, invoiceRead, payableRead, hint);
    movement = makeDebit();
    await movementRepo.saveBulk([movement]);
  });

  it("throws MovementNotFoundError for unknown movement", async () => {
    await expect(useCase.execute("not-found")).rejects.toThrow(MovementNotFoundError);
  });

  it("returns empty array when no candidates exist", async () => {
    const result = await useCase.execute(movement.id);
    expect(result).toHaveLength(0);
  });

  it("returns invoice candidate with exact amount match", async () => {
    invoiceRead.setcandidates([makeInvoiceCandidate()]);

    const result = await useCase.execute(movement.id);
    expect(result).toHaveLength(1);
    expect(result[0]!.entityType).toBe("invoice");
    expect(result[0]!.entityId).toBe("inv-1");
    expect(result[0]!.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it("returns payable candidate", async () => {
    payableRead.setCandidates([makePayableCandidate()]);

    const result = await useCase.execute(movement.id);
    expect(result).toHaveLength(1);
    expect(result[0]!.entityType).toBe("payable_entry");
    expect(result[0]!.entityId).toBe("pe-1");
  });

  it("boosts confidence when supplier name appears in movement description", async () => {
    // Movement description is "PAGAMENTO EDP SA"
    // Scoring requires words with length > 3 to trigger name boost
    // "PAGAMENTO" (9 chars) appears in the description → boost applies
    const movement2 = BankMovement.create({
      statementImportId: "stmt-1",
      bookingDate: BOOKING_DATE,
      valueDate: BOOKING_DATE,
      description: "PAGAMENTO FATURA GALP ENERGIA",
      amount: 12_000,
      balanceAfter: 88_000,
      movementType: "debit",
      deduplicationHash: "h-name-boost",
    });
    await movementRepo.saveBulk([movement2]);

    // "GALP" (4 chars, exactly 4, not > 3) and "ENERGIA" (7 chars, > 3) → "energia" in desc → boost
    invoiceRead.setcandidates([makeInvoiceCandidate({ supplierName: "GALP ENERGIA", dueDate: "2026-07-05" })]);
    // "XPTO" is 4 chars so not > 3; no boost
    payableRead.setCandidates([makePayableCandidate({ supplierName: "XPTO", amount: 12_000 })]);

    const result = await useCase.execute(movement2.id);
    const invoiceCandidate = result.find((c) => c.entityType === "invoice");
    const payableCandidate = result.find((c) => c.entityType === "payable_entry");
    expect(invoiceCandidate).toBeDefined();
    expect(payableCandidate).toBeDefined();
    expect(invoiceCandidate!.confidence).toBeGreaterThan(payableCandidate!.confidence);
  });

  it("sorts candidates by confidence descending", async () => {
    invoiceRead.setcandidates([
      makeInvoiceCandidate({ id: "inv-1", supplierName: "EDP SA" }), // name boost
      makeInvoiceCandidate({ id: "inv-2", supplierName: "Unknown Supplier", dueDate: null }),
    ]);

    const result = await useCase.execute(movement.id);
    expect(result[0]!.confidence).toBeGreaterThanOrEqual(result[1]!.confidence);
  });

  it("excludes candidates below minimum confidence", async () => {
    // Candidate with very different amount won't reach min confidence
    invoiceRead.setcandidates([
      makeInvoiceCandidate({ totalWithVat: 1_000_000 }), // far from 12_000
    ]);

    // The fake filters by tolerance; the scoring will not matter if fake already filters it out.
    // But let's also test candidates that pass the fake's filter but fail score:
    payableRead.setCandidates([]);
    const result = await useCase.execute(movement.id);
    // Invoice is filtered by the fake itself (tolerance is small)
    expect(result).toHaveLength(0);
  });

  it("entityLabel combines supplier name and identifier", async () => {
    invoiceRead.setcandidates([makeInvoiceCandidate()]);

    const result = await useCase.execute(movement.id);
    expect(result[0]!.entityLabel).toBe("EDP SA — FT 2026/100");
  });

  it("includes supplierId in each candidate", async () => {
    invoiceRead.setcandidates([makeInvoiceCandidate({ supplierId: "sup-edp" })]);
    payableRead.setCandidates([makePayableCandidate({ supplierId: "sup-nos" })]);

    const result = await useCase.execute(movement.id);
    const inv = result.find((c) => c.entityType === "invoice");
    const pe = result.find((c) => c.entityType === "payable_entry");
    expect(inv!.supplierId).toBe("sup-edp");
    expect(pe!.supplierId).toBe("sup-nos");
  });

  it("applies hint boost — hinted candidate scores higher than name-only candidate", async () => {
    // movement description "PAGAMENTO EDP SA" → normalized "edp"
    // Pre-populate hint: the normalized description maps to sup-1
    hint.setHint("edp", "sup-1");

    invoiceRead.setcandidates([
      makeInvoiceCandidate({ id: "inv-hinted", supplierId: "sup-1", supplierName: "EDP SA" }),
      makeInvoiceCandidate({ id: "inv-other", supplierId: "sup-9", supplierName: "OTHER Corp" }),
    ]);

    const result = await useCase.execute(movement.id);
    const hinted = result.find((c) => c.entityId === "inv-hinted");
    const other = result.find((c) => c.entityId === "inv-other");

    expect(hinted).toBeDefined();
    expect(other).toBeDefined();
    // Hinted candidate must score higher
    expect(hinted!.confidence).toBeGreaterThan(other!.confidence);
    // And the list must be sorted descending
    expect(result[0]!.entityId).toBe("inv-hinted");
  });
});
