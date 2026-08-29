import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { SuggestMatchesUseCase } from "../../application/use-cases/suggest-matches.use-case.js";
import { BankStatementImport } from "../../domain/entities/bank-statement-import.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { FakeBankStatementImportRepository } from "../fakes/fake-bank-statement-import-repository.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeInvoiceMatchRead } from "../fakes/fake-invoice-match-read.js";
import { FakePayableEntryMatchRead } from "../fakes/fake-payable-entry-match-read.js";
import { FakeMovementMatchHint } from "../fakes/fake-movement-match-hint.js";
import { StatementNotFoundError } from "../../domain/errors.js";
import type { InvoiceMatchCandidate } from "../../domain/ports/out/invoice-match-read.port.js";

const BOOKING_DATE = new Date("2026-07-05T00:00:00.000Z");

function makeStatement() {
  return BankStatementImport.create({
    bankName: "Millennium BCP",
    accountNumber: "1234-5678",
    periodStart: new Date("2026-07-01"),
    periodEnd: new Date("2026-07-31"),
    sourceType: "csv",
    openingBalance: 100_000,
    closingBalance: 95_000,
  });
}

function makeDebit(statementImportId: string, amount = 12_000, hash = "h1") {
  return BankMovement.create({
    statementImportId,
    bookingDate: BOOKING_DATE,
    valueDate: BOOKING_DATE,
    description: "PAGAMENTO EDP SA",
    amount,
    balanceAfter: 88_000,
    movementType: "debit",
    deduplicationHash: hash,
  });
}

function makeCredit(statementImportId: string, hash = "hc") {
  return BankMovement.create({
    statementImportId,
    bookingDate: BOOKING_DATE,
    valueDate: BOOKING_DATE,
    description: "TRANSFERENCIA RECEBIDA",
    amount: 50_000,
    balanceAfter: 150_000,
    movementType: "credit",
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

describe("SuggestMatchesUseCase", () => {
  const organizationId = mintOrganizationId("org-a");
  let statementRepo: FakeBankStatementImportRepository;
  let movementRepo: FakeBankMovementRepository;
  let invoiceRead: FakeInvoiceMatchRead;
  let payableRead: FakePayableEntryMatchRead;
  let hint: FakeMovementMatchHint;
  let useCase: SuggestMatchesUseCase;
  let statement: BankStatementImport;

  beforeEach(async () => {
    statementRepo = new FakeBankStatementImportRepository();
    movementRepo = new FakeBankMovementRepository();
    invoiceRead = new FakeInvoiceMatchRead();
    payableRead = new FakePayableEntryMatchRead();
    hint = new FakeMovementMatchHint();
    useCase = new SuggestMatchesUseCase(statementRepo, movementRepo, invoiceRead, payableRead, hint);
    statement = makeStatement();
    await statementRepo.save(organizationId, statement);
  });

  it("throws StatementNotFoundError for unknown statement", async () => {
    await expect(
      useCase.execute({ organizationId, statementImportId: "not-found" })
    ).rejects.toThrow(StatementNotFoundError);
  });

  it("returns empty array when no unresolved movements", async () => {
    const result = await useCase.execute({ organizationId, statementImportId: statement.id });
    expect(result).toHaveLength(0);
  });

  it("returns empty array when no candidates match", async () => {
    await movementRepo.saveBulk(organizationId, [makeDebit(statement.id)]);

    const result = await useCase.execute({ organizationId, statementImportId: statement.id });
    expect(result).toHaveLength(0);
  });

  it("creates a suggestion for matching invoice", async () => {
    const movement = makeDebit(statement.id);
    await movementRepo.saveBulk(organizationId, [movement]);
    invoiceRead.setcandidates(organizationId, [makeInvoiceCandidate()]);

    const suggestions = await useCase.execute({ organizationId, statementImportId: statement.id });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.entityType).toBe("invoice");
    expect(suggestions[0]!.entityId).toBe("inv-1");
    expect(suggestions[0]!.movementId).toBe(movement.id);
    expect(suggestions[0]!.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it("marks movement status as sugestao", async () => {
    const movement = makeDebit(statement.id);
    await movementRepo.saveBulk(organizationId, [movement]);
    invoiceRead.setcandidates(organizationId, [makeInvoiceCandidate()]);

    await useCase.execute({ organizationId, statementImportId: statement.id });

    const updated = await movementRepo.findById(organizationId, movement.id);
    expect(updated!.reconciliationStatus).toBe("sugestao");
    expect(updated!.matchedEntityId).toBe("inv-1");
  });

  it("skips already resolved movements", async () => {
    const resolved = makeDebit(statement.id).classify({ justificationType: "despesa_bancaria_automatica" });
    await movementRepo.saveBulk(organizationId, [resolved]);
    invoiceRead.setcandidates(organizationId, [makeInvoiceCandidate()]);

    const suggestions = await useCase.execute({ organizationId, statementImportId: statement.id });
    expect(suggestions).toHaveLength(0);
  });

  it("skips credits (only debits are matched)", async () => {
    await movementRepo.saveBulk(organizationId, [makeCredit(statement.id)]);
    invoiceRead.setcandidates(organizationId, [makeInvoiceCandidate({ totalWithVat: 50_000 })]);

    const suggestions = await useCase.execute({ organizationId, statementImportId: statement.id });
    expect(suggestions).toHaveLength(0);
  });

  it("does not claim the same entity for two movements", async () => {
    const m1 = makeDebit(statement.id, 12_000, "h1");
    const m2 = makeDebit(statement.id, 12_000, "h2");
    await movementRepo.saveBulk(organizationId, [m1, m2]);
    // Only one invoice candidate with totalWithVat = 12_000
    invoiceRead.setcandidates(organizationId, [makeInvoiceCandidate({ id: "inv-unique" })]);

    const suggestions = await useCase.execute({ organizationId, statementImportId: statement.id });
    // The same invoice should not be suggested twice
    const entityIds = suggestions.map((s) => s.entityId);
    expect(new Set(entityIds).size).toBe(entityIds.length);
    expect(suggestions.filter((s) => s.entityId === "inv-unique")).toHaveLength(1);
  });

  it("skips movements already in sugestao status", async () => {
    const movement = makeDebit(statement.id).markAsSuggestion("invoice", "inv-old", 0.8);
    await movementRepo.saveBulk(organizationId, [movement]);
    invoiceRead.setcandidates(organizationId, [makeInvoiceCandidate({ id: "inv-new" })]);

    const suggestions = await useCase.execute({ organizationId, statementImportId: statement.id });
    expect(suggestions).toHaveLength(0);
  });

  it("applies hint boost when description matches a known supplier", async () => {
    // movement description "PAGAMENTO EDP SA" → normalized contains "edp"
    // Pre-populate hint: "edp" → "sup-1"
    hint.setHint(organizationId, "edp", "sup-1");

    const movement = makeDebit(statement.id);
    await movementRepo.saveBulk(organizationId, [movement]);

    // Two candidates: one for the hinted supplier (sup-1), one for another supplier
    invoiceRead.setcandidates(organizationId, [
      makeInvoiceCandidate({ id: "inv-hinted", supplierId: "sup-1", supplierName: "EDP SA" }),
      makeInvoiceCandidate({ id: "inv-other", supplierId: "sup-9", supplierName: "OTHER SA" }),
    ]);

    const suggestions = await useCase.execute({ organizationId, statementImportId: statement.id });
    // The hinted invoice should win
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.entityId).toBe("inv-hinted");
    // Confidence must be above what name-substring alone would give
    expect(suggestions[0]!.confidence).toBeGreaterThan(0.6);
  });
});
