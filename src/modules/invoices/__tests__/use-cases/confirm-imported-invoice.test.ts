import { ConfirmImportedInvoiceUseCase } from "../../application/use-cases/confirm-imported-invoice.use-case.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { DuplicateInvoiceError } from "../../domain/errors.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { FakePayableEntryWrite } from "../fakes/fake-payable-entry-write.js";

function makeDraftInvoice(overrides: Partial<Parameters<typeof Invoice.createFromImport>[0]> = {}): Invoice {
  return Invoice.createFromImport({
    supplierName: "Makro Portugal SA",
    supplierNifSnapshot: "500123456",
    invoiceNumber: "INV-2026-001",
    invoiceDate: new Date("2026-06-01"),
    dueDate: new Date("2026-07-01"),
    subtotalWithoutVat: 100000,
    totalVat: 23000,
    totalWithVat: 123000,
    source: "pdf_import",
    attachmentUrl: "https://storage.example.com/fatura.pdf",
    aiConfidence: 0.92,
    requiresReview: false,
    ...overrides,
  });
}

describe("ConfirmImportedInvoiceUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let lineRepo: FakeInvoiceLineRepository;
  let payableWrite: FakePayableEntryWrite;
  let useCase: ConfirmImportedInvoiceUseCase;

  beforeEach(() => {
    invoiceRepo = new FakeInvoiceRepository();
    lineRepo = new FakeInvoiceLineRepository();
    payableWrite = new FakePayableEntryWrite();
    useCase = new ConfirmImportedInvoiceUseCase(invoiceRepo, lineRepo, payableWrite);
  });

  it("transitions draft_ai to pending", async () => {
    const draft = makeDraftInvoice();
    await invoiceRepo.save(draft);

    const result = await useCase.execute({ id: draft.id });

    expect(result.status).toBe("pending");
    expect(result.requiresReview).toBe(false);
  });

  it("applies user corrections to the invoice fields", async () => {
    const draft = makeDraftInvoice({ invoiceNumber: "" });
    await invoiceRepo.save(draft);

    const result = await useCase.execute({
      id: draft.id,
      invoiceNumber: "MKR-2026-0421",
      supplierId: "sup-1",
      costCenterGroupId: "grp-ops",
    });

    expect(result.invoiceNumber).toBe("MKR-2026-0421");
    expect(result.supplierId).toBe("sup-1");
    expect(result.costCenterGroupId).toBe("grp-ops");
  });

  it("creates a payable entry when saveAsPayable is true and dueDate is set", async () => {
    const draft = makeDraftInvoice();
    await invoiceRepo.save(draft);

    await useCase.execute({ id: draft.id, saveAsPayable: true });

    expect(payableWrite.created).toHaveLength(1);
    expect(payableWrite.created[0].invoiceId).toBe(draft.id);
    expect(payableWrite.created[0].amount).toBe(123000);
  });

  it("does not create payable entry when saveAsPayable is false", async () => {
    const draft = makeDraftInvoice();
    await invoiceRepo.save(draft);

    await useCase.execute({ id: draft.id, saveAsPayable: false });

    expect(payableWrite.created).toHaveLength(0);
  });

  it("does not create payable entry when dueDate is missing", async () => {
    const draft = makeDraftInvoice({ dueDate: null });
    await invoiceRepo.save(draft);

    await useCase.execute({ id: draft.id, saveAsPayable: true });

    expect(payableWrite.created).toHaveLength(0);
  });

  it("saves optional lines provided during confirmation", async () => {
    const draft = makeDraftInvoice();
    await invoiceRepo.save(draft);

    await useCase.execute({
      id: draft.id,
      lines: [
        {
          description: "Farinha T55 25kg",
          quantity: 10,
          unitCostWithoutVat: 8000,
          vatRate: 6,
          vatAmount: 480,
          totalWithVat: 8480,
        },
      ],
    });

    const lines = await lineRepo.findByInvoiceId(draft.id);
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe("Farinha T55 25kg");
  });

  it("throws InvoiceNotFoundError for unknown id", async () => {
    await expect(useCase.execute({ id: "unknown" })).rejects.toThrow("not found");
  });

  it("throws when trying to confirm an already confirmed (pending) invoice", async () => {
    const draft = makeDraftInvoice();
    await invoiceRepo.save(draft);
    // Confirm once
    await useCase.execute({ id: draft.id });

    // Try to confirm again
    await expect(useCase.execute({ id: draft.id })).rejects.toThrow("Cannot confirm");
  });

  it("lança DuplicateInvoiceError ao confirmar quando já existe outra fatura com mesmo número e NIF", async () => {
    // Existing invoice with the same NIF + invoice number (created via import so NIF is stored)
    const existing = Invoice.createFromImport({
      supplierName: "Makro Portugal SA",
      supplierNifSnapshot: "500123456",
      invoiceNumber: "INV-2026-001",
      invoiceDate: new Date("2026-05-01"),
      dueDate: null,
      subtotalWithoutVat: 100000,
      totalVat: 23000,
      totalWithVat: 123000,
      source: "pdf_import",
      attachmentUrl: null,
      aiConfidence: 0.95,
      requiresReview: false,
    });
    // Transition to pending so status is not draft_ai (still non-cancelled → counts as duplicate)
    await invoiceRepo.save(existing);

    // A new draft to confirm — same invoice number and NIF
    const draft = makeDraftInvoice({ invoiceNumber: "INV-2026-999" }); // different number initially
    await invoiceRepo.save(draft);

    // User corrects the invoice number to the duplicate value in the form
    await expect(
      useCase.execute({ id: draft.id, invoiceNumber: "INV-2026-001", supplierNifSnapshot: "500123456" }),
    ).rejects.toThrow(DuplicateInvoiceError);
  });

  it("não lança DuplicateInvoiceError ao confirmar a mesma fatura (excludeId correto)", async () => {
    const draft = makeDraftInvoice({ supplierNifSnapshot: "500123456" });
    await invoiceRepo.save(draft);

    // Confirming the same draft — NIF matches itself but excludeId prevents false positive
    await expect(
      useCase.execute({ id: draft.id, supplierNifSnapshot: "500123456" }),
    ).resolves.toBeDefined();
  });
});
