import { ImportInvoiceUseCase } from "../../application/use-cases/import-invoice.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeDocumentStoragePort } from "../fakes/fake-document-storage.port.js";
import { FakeAiExtractionPort } from "../fakes/fake-ai-extraction.port.js";
import { FakeSupplierLookupPort } from "../fakes/fake-supplier-lookup.port.js";
import { FakeSupplierHintPort } from "../fakes/fake-supplier-hint.port.js";

function makeBuffer(): Buffer {
  return Buffer.from("fake-pdf-content");
}

describe("ImportInvoiceUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let storage: FakeDocumentStoragePort;
  let aiExtraction: FakeAiExtractionPort;
  let supplierLookup: FakeSupplierLookupPort;
  let supplierHint: FakeSupplierHintPort;
  let useCase: ImportInvoiceUseCase;

  beforeEach(() => {
    invoiceRepo = new FakeInvoiceRepository();
    storage = new FakeDocumentStoragePort();
    aiExtraction = new FakeAiExtractionPort();
    supplierLookup = new FakeSupplierLookupPort();
    supplierHint = new FakeSupplierHintPort();
    useCase = new ImportInvoiceUseCase(invoiceRepo, storage, aiExtraction, supplierLookup, supplierHint);
  });

  it("stores the file and creates a draft_ai invoice", async () => {
    const result = await useCase.execute({
      fileBuffer: makeBuffer(),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    expect(storage.storedFiles).toHaveLength(1);
    expect(storage.storedFiles[0].filename).toBe("fatura.pdf");
    expect(result.invoice.status).toBe("draft_ai");
    expect(result.invoice.source).toBe("pdf_import");
  });

  it("matches supplier by NIF and applies defaults", async () => {
    supplierLookup.seed([
      {
        id: "sup-1",
        name: "Makro Portugal SA",
        nif: "500123456",
        defaultCostCenterGroupId: "grp-ops",
        defaultCostCenterCategoryId: "cat-cmv",
        defaultFinancialType: "operational",
      },
    ]);

    const result = await useCase.execute({
      fileBuffer: makeBuffer(),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    expect(result.supplierMatch).not.toBeNull();
    expect(result.supplierMatch?.id).toBe("sup-1");
    expect(result.invoice.supplierId).toBe("sup-1");
    expect(result.invoice.costCenterGroupId).toBe("grp-ops");
    expect(result.invoice.financialType).toBe("operational");
  });

  it("sets no_supplier_match validation issue when NIF is not found", async () => {
    // supplierLookup is empty
    const result = await useCase.execute({
      fileBuffer: makeBuffer(),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    expect(result.validationIssues).toContain("no_supplier_match");
    expect(result.invoice.requiresReview).toBe(true);
  });

  it("sets low_ai_confidence issue when confidence is below threshold", async () => {
    supplierLookup.seed([
      {
        id: "sup-1",
        name: "Makro Portugal SA",
        nif: "500123456",
        defaultCostCenterGroupId: null,
        defaultCostCenterCategoryId: null,
        defaultFinancialType: null,
      },
    ]);
    aiExtraction.setResult({ confidence: 0.5, dueDate: new Date("2026-07-01") });

    const result = await useCase.execute({
      fileBuffer: makeBuffer(),
      filename: "fatura.jpg",
      mimeType: "image/jpeg",
    });

    expect(result.validationIssues).toContain("low_ai_confidence");
    expect(result.invoice.source).toBe("image_import");
  });

  it("sets value_discrepancy issue when totals do not add up", async () => {
    supplierLookup.seed([
      {
        id: "sup-1",
        name: "Makro Portugal SA",
        nif: "500123456",
        defaultCostCenterGroupId: null,
        defaultCostCenterCategoryId: null,
        defaultFinancialType: null,
      },
    ]);
    aiExtraction.setResult({
      subtotalWithoutVat: 100000,
      vatAmount: 23000,
      totalWithVat: 124000, // diverge: 100000 + 23000 = 123000, not 124000
      dueDate: new Date("2026-07-01"),
      confidence: 0.92,
    });

    const result = await useCase.execute({
      fileBuffer: makeBuffer(),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    expect(result.validationIssues).toContain("value_discrepancy");
  });

  it("sets no_due_date issue when AI could not extract due date", async () => {
    supplierLookup.seed([
      {
        id: "sup-1",
        name: "Makro Portugal SA",
        nif: "500123456",
        defaultCostCenterGroupId: null,
        defaultCostCenterCategoryId: null,
        defaultFinancialType: null,
      },
    ]);
    aiExtraction.setResult({ dueDate: null, confidence: 0.92 });

    const result = await useCase.execute({
      fileBuffer: makeBuffer(),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    expect(result.validationIssues).toContain("no_due_date");
    expect(result.invoice.dueDate).toBeNull();
  });

  it("persists the draft invoice in the repository", async () => {
    const result = await useCase.execute({
      fileBuffer: makeBuffer(),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    const saved = await invoiceRepo.findById(result.invoice.id);
    expect(saved).not.toBeNull();
    expect(saved?.status).toBe("draft_ai");
  });

  it("normaliza NIF antes do lookup — casa mesmo com formatação diferente", async () => {
    supplierLookup.seed([
      {
        id: "sup-1",
        name: "Makro Portugal SA",
        nif: "500123456",
        defaultCostCenterGroupId: null,
        defaultCostCenterCategoryId: null,
        defaultFinancialType: null,
      },
    ]);
    // IA extrai NIF com pontos (formato PT típico)
    aiExtraction.setResult({ supplierNif: "500.123.456" });

    const result = await useCase.execute({
      fileBuffer: makeBuffer(),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    expect(result.supplierMatch?.id).toBe("sup-1");
    expect(result.validationIssues).not.toContain("no_supplier_match");
  });

  it("usa hint quando NIF não casa mas nome foi confirmado anteriormente", async () => {
    const supplier = {
      id: "sup-1",
      name: "Makro Portugal SA",
      nif: "500123456",
      defaultCostCenterGroupId: null,
      defaultCostCenterCategoryId: null,
      defaultFinancialType: null,
    };
    supplierHint.seedSuppliers([supplier]);
    // Pré-popular hint: nome normalizado → fornecedor
    supplierHint.seedHint("makro portugal", "sup-1");
    // IA extrai NIF errado — NIF lookup vai falhar
    aiExtraction.setResult({ supplierNif: "999999999", supplierName: "Makro Portugal, SA" });

    const result = await useCase.execute({
      fileBuffer: makeBuffer(),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    expect(result.supplierMatch?.id).toBe("sup-1");
    expect(result.validationIssues).not.toContain("no_supplier_match");
    expect(result.validationIssues).not.toContain("supplier_matched_by_name");
  });

  it("usa fuzzy matching quando NIF e hint falham — adiciona supplier_matched_by_name", async () => {
    supplierLookup.seed([
      {
        id: "sup-1",
        name: "Makro Portugal SA",
        nif: "500123456",
        defaultCostCenterGroupId: null,
        defaultCostCenterCategoryId: null,
        defaultFinancialType: null,
      },
    ]);
    // NIF completamente diferente, sem hint
    aiExtraction.setResult({ supplierNif: "000000000", supplierName: "Makro Portugal S.A." });

    const result = await useCase.execute({
      fileBuffer: makeBuffer(),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    expect(result.supplierMatch?.id).toBe("sup-1");
    expect(result.validationIssues).toContain("supplier_matched_by_name");
    expect(result.validationIssues).not.toContain("no_supplier_match");
  });

  it("não casa por fuzzy quando similaridade é insuficiente", async () => {
    supplierLookup.seed([
      {
        id: "sup-1",
        name: "Metro Cash & Carry Portugal",
        nif: "500123456",
        defaultCostCenterGroupId: null,
        defaultCostCenterCategoryId: null,
        defaultFinancialType: null,
      },
    ]);
    aiExtraction.setResult({ supplierNif: null, supplierName: "EDP Comercial SA" });

    const result = await useCase.execute({
      fileBuffer: makeBuffer(),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    expect(result.supplierMatch).toBeNull();
    expect(result.validationIssues).toContain("no_supplier_match");
  });

  it("adiciona duplicate_invoice às validationIssues quando já existe fatura com mesmo número e NIF", async () => {
    // FakeAiExtractionPort returns invoiceNumber="INV-2026-001" + supplierNif="500123456"
    // Seed a pre-existing invoice with the same NIF (supplierNifSnapshot) + invoice number
    const { Invoice } = await import("../../domain/entities/invoice.js");
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
    await invoiceRepo.save(existing);

    const result = await useCase.execute({
      fileBuffer: makeBuffer(),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    expect(result.validationIssues).toContain("duplicate_invoice");
    expect(result.invoice.requiresReview).toBe(true);
  });
});
