import { ImportInvoiceUseCase } from "../../application/use-cases/import-invoice.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeDocumentStoragePort } from "../fakes/fake-document-storage.port.js";
import { FakeAiExtractionPort } from "../fakes/fake-ai-extraction.port.js";
import { FakeSupplierLookupPort } from "../fakes/fake-supplier-lookup.port.js";
import { FakeSupplierHintPort } from "../fakes/fake-supplier-hint.port.js";
import { FakeOrganizationIdentityRead } from "../fakes/fake-organization-identity-read.port.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG_ID = mintOrganizationId("org-test");

function makeBuffer(): Buffer {
  return Buffer.from("fake-pdf-content");
}

describe("ImportInvoiceUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let storage: FakeDocumentStoragePort;
  let aiExtraction: FakeAiExtractionPort;
  let supplierLookup: FakeSupplierLookupPort;
  let supplierHint: FakeSupplierHintPort;
  let organizationIdentityRead: FakeOrganizationIdentityRead;
  let useCase: ImportInvoiceUseCase;

  beforeEach(() => {
    invoiceRepo = new FakeInvoiceRepository();
    storage = new FakeDocumentStoragePort();
    aiExtraction = new FakeAiExtractionPort();
    supplierLookup = new FakeSupplierLookupPort();
    supplierHint = new FakeSupplierHintPort();
    organizationIdentityRead = new FakeOrganizationIdentityRead();
    useCase = new ImportInvoiceUseCase(invoiceRepo, storage, aiExtraction, supplierLookup, supplierHint, organizationIdentityRead);
  });

  it("stores the file and creates a draft_ai invoice", async () => {
    const result = await useCase.execute({
      organizationId: ORG_ID,
      fileBuffer: makeBuffer(),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    expect(storage.storedFiles).toHaveLength(1);
    expect(storage.storedFiles[0].filename).toBe("fatura.pdf");
    expect(storage.storedFiles[0].organizationId).toBe(ORG_ID);
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
      organizationId: ORG_ID,
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
      organizationId: ORG_ID,
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
      organizationId: ORG_ID,
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
      organizationId: ORG_ID,
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
      organizationId: ORG_ID,
      fileBuffer: makeBuffer(),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    expect(result.validationIssues).toContain("no_due_date");
    expect(result.invoice.dueDate).toBeNull();
  });

  it("persists the draft invoice in the repository", async () => {
    const result = await useCase.execute({
      organizationId: ORG_ID,
      fileBuffer: makeBuffer(),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    const saved = await invoiceRepo.findById(ORG_ID, result.invoice.id);
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
      organizationId: ORG_ID,
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
      organizationId: ORG_ID,
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
      organizationId: ORG_ID,
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
      organizationId: ORG_ID,
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
    await invoiceRepo.save(ORG_ID, existing);

    const result = await useCase.execute({
      organizationId: ORG_ID,
      fileBuffer: makeBuffer(),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    expect(result.validationIssues).toContain("duplicate_invoice");
    expect(result.invoice.requiresReview).toBe(true);
  });

  it("adiciona duplicate_invoice quando o NIF não é extraído mas o fornecedor é resolvido por nome (regressão: alerta não disparava)", async () => {
    supplierLookup.seed([
      {
        id: "sup-dream-plus",
        name: "Dream Plus Comércio e Distribuição Produtos Alimentares Lda",
        nif: "500999888",
        defaultCostCenterGroupId: null,
        defaultCostCenterCategoryId: null,
        defaultFinancialType: null,
      },
    ]);
    // Este scan não extraiu o NIF — só o nome do fornecedor, resolvido por fuzzy match.
    aiExtraction.setResult({
      supplierNif: null,
      supplierName: "Dream Plus Comércio e Distribuição Produtos Alimentares Lda",
      invoiceNumber: "55199",
    });

    const { Invoice } = await import("../../domain/entities/invoice.js");
    const existing = Invoice.createFromImport({
      supplierId: "sup-dream-plus",
      supplierName: "Dream Plus Comércio e Distribuição Produtos Alimentares Lda",
      supplierNifSnapshot: "500999888",
      invoiceNumber: "55199",
      invoiceDate: new Date("2026-08-01"),
      dueDate: null,
      subtotalWithoutVat: 50000,
      totalVat: 11500,
      totalWithVat: 61500,
      source: "pdf_import",
      attachmentUrl: null,
      aiConfidence: 0.9,
      requiresReview: false,
    });
    await invoiceRepo.save(ORG_ID, existing);

    const result = await useCase.execute({
      organizationId: ORG_ID,
      fileBuffer: makeBuffer(),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    expect(result.supplierMatch?.id).toBe("sup-dream-plus");
    expect(result.validationIssues).toContain("duplicate_invoice");
  });

  // ── Guard: never treat our own company as the supplier ──────────────────────

  it("nunca associa a própria empresa como fornecedor quando a IA extrai o NIF da organização (caso Gold Energy / Raul Afonso e Mariana Cavalcanti)", async () => {
    organizationIdentityRead.seedNif("518902609");
    // A IA leu os dados de faturação (a nossa empresa, sob o nome social
    // anterior) em vez do emitente real (Gold Energy).
    aiExtraction.setResult({
      supplierNif: "518902609",
      supplierName: "Raul Afonso e Mariana Cavalcanti Lda",
      invoiceNumber: "DR2605477119",
    });

    const result = await useCase.execute({
      organizationId: ORG_ID,
      fileBuffer: makeBuffer(),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    expect(result.supplierMatch).toBeNull();
    expect(result.invoice.supplierId).toBeNull();
    expect(result.invoice.supplierName).toBe("Fornecedor desconhecido");
    expect(result.invoice.supplierNifSnapshot).toBeNull();
    expect(result.validationIssues).toContain("supplier_is_own_company");
    expect(result.validationIssues).toContain("no_supplier_match");
    expect(result.invoice.requiresReview).toBe(true);
  });

  it("reconhece o NIF da própria empresa mesmo com formatação diferente (pontos/espaços)", async () => {
    organizationIdentityRead.seedNif("518902609");
    aiExtraction.setResult({ supplierNif: "518.902.609", supplierName: "Angry Box Lda" });

    const result = await useCase.execute({
      organizationId: ORG_ID,
      fileBuffer: makeBuffer(),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    expect(result.validationIssues).toContain("supplier_is_own_company");
    expect(result.invoice.supplierName).toBe("Fornecedor desconhecido");
  });

  it("não sinaliza supplier_is_own_company quando o NIF extraído é de um fornecedor real diferente", async () => {
    organizationIdentityRead.seedNif("518902609");
    supplierLookup.seed([
      {
        id: "sup-gold-energy",
        name: "Gold Energy",
        nif: "509999999",
        defaultCostCenterGroupId: null,
        defaultCostCenterCategoryId: null,
        defaultFinancialType: null,
      },
    ]);
    aiExtraction.setResult({ supplierNif: "509999999", supplierName: "Gold Energy" });

    const result = await useCase.execute({
      organizationId: ORG_ID,
      fileBuffer: makeBuffer(),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    expect(result.validationIssues).not.toContain("supplier_is_own_company");
    expect(result.supplierMatch?.id).toBe("sup-gold-energy");
    expect(result.invoice.supplierName).toBe("Gold Energy");
  });
});
