import { ConfirmImportedInvoiceUseCase } from "../../application/use-cases/confirm-imported-invoice.use-case.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { DuplicateInvoiceError } from "../../domain/errors.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { FakePayableEntryWrite } from "../fakes/fake-payable-entry-write.js";
import { FakeSupplierCreatePort } from "../fakes/fake-supplier-create.port.js";
import { FakeSupplierHintPort } from "../fakes/fake-supplier-hint.port.js";

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
  let supplierCreate: FakeSupplierCreatePort;
  let supplierHint: FakeSupplierHintPort;
  let useCase: ConfirmImportedInvoiceUseCase;

  beforeEach(() => {
    invoiceRepo = new FakeInvoiceRepository();
    lineRepo = new FakeInvoiceLineRepository();
    payableWrite = new FakePayableEntryWrite();
    supplierCreate = new FakeSupplierCreatePort();
    supplierHint = new FakeSupplierHintPort();
    useCase = new ConfirmImportedInvoiceUseCase(invoiceRepo, lineRepo, payableWrite, supplierCreate, supplierHint);
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

  it("creates payable entry when saveAsPayable is true and dueDate is set", async () => {
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
    await useCase.execute({ id: draft.id });

    await expect(useCase.execute({ id: draft.id })).rejects.toThrow("Cannot confirm");
  });

  it("lança DuplicateInvoiceError ao confirmar quando já existe outra fatura com mesmo número e NIF", async () => {
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

    const draft = makeDraftInvoice({ invoiceNumber: "INV-2026-999" });
    await invoiceRepo.save(draft);

    await expect(
      useCase.execute({ id: draft.id, invoiceNumber: "INV-2026-001", supplierNifSnapshot: "500123456" }),
    ).rejects.toThrow(DuplicateInvoiceError);
  });

  it("não lança DuplicateInvoiceError ao confirmar a mesma fatura (excludeId correto)", async () => {
    const draft = makeDraftInvoice({ supplierNifSnapshot: "500123456" });
    await invoiceRepo.save(draft);

    await expect(
      useCase.execute({ id: draft.id, supplierNifSnapshot: "500123456" }),
    ).resolves.toBeDefined();
  });

  // ── Feature: criar fornecedor novo ────────────────────────────────────────

  it("cria fornecedor novo quando newSupplier é fornecido e usa o ID retornado", async () => {
    const draft = makeDraftInvoice({ supplierId: undefined });
    await invoiceRepo.save(draft);

    const result = await useCase.execute({
      id: draft.id,
      newSupplier: {
        name: "Novo Fornecedor Lda",
        nif: "999888777",
      },
    });

    expect(supplierCreate.created).toHaveLength(1);
    expect(supplierCreate.created[0].name).toBe("Novo Fornecedor Lda");
    expect(result.supplierId).toMatch(/^supplier-/);
  });

  it("newSupplier tem precedência sobre supplierId quando ambos são fornecidos", async () => {
    const draft = makeDraftInvoice();
    await invoiceRepo.save(draft);

    const result = await useCase.execute({
      id: draft.id,
      supplierId: "sup-existente",
      newSupplier: { name: "Novo Fornecedor Criado" },
    });

    expect(supplierCreate.created).toHaveLength(1);
    // O ID veio do fornecedor criado, não do supplierId
    expect(result.supplierId).toMatch(/^supplier-/);
    expect(result.supplierId).not.toBe("sup-existente");
  });

  // ── Feature: costCenterCategoryId ao nível da fatura ─────────────────────

  it("propaga costCenterCategoryId às linhas existentes ao confirmar", async () => {
    const draft = makeDraftInvoice();
    await invoiceRepo.save(draft);

    // Pré-criar uma linha na fatura
    const line = InvoiceLine.create({
      invoiceId: draft.id,
      description: "Produto X",
      quantity: 1,
      unitCostWithoutVat: 1000,
      vatRate: 23,
      vatAmount: 230,
      totalWithVat: 1230,
    });
    await lineRepo.saveAll([line]);

    await useCase.execute({
      id: draft.id,
      costCenterCategoryId: "cat-cmv",
    });

    const lines = await lineRepo.findByInvoiceId(draft.id);
    expect(lines[0].costCenterCategoryId).toBe("cat-cmv");
  });

  it("não propaga CC às linhas quando costCenterCategoryId é null (linha mantém o seu)", async () => {
    const draft = makeDraftInvoice();
    await invoiceRepo.save(draft);

    const line = InvoiceLine.create({
      invoiceId: draft.id,
      description: "Produto X",
      quantity: 1,
      unitCostWithoutVat: 1000,
      vatRate: 23,
      vatAmount: 230,
      totalWithVat: 1230,
      costCenterCategoryId: "cat-original",
    });
    await lineRepo.saveAll([line]);

    // Confirm sem especificar costCenterCategoryId — não deve sobrescrever
    await useCase.execute({ id: draft.id });

    const lines = await lineRepo.findByInvoiceId(draft.id);
    expect(lines[0].costCenterCategoryId).toBe("cat-original");
  });

  // ── Direct Debit ──────────────────────────────────────────────────────────

  it("confirma com isDirectDebit e directDebitDate — DTO inclui os campos", async () => {
    const draft = makeDraftInvoice({ dueDate: null });
    await invoiceRepo.save(draft);

    const result = await useCase.execute({
      id: draft.id,
      isDirectDebit: true,
      directDebitDate: "2026-09-05",
    });

    expect(result.isDirectDebit).toBe(true);
    expect(result.directDebitDate).toBe("2026-09-05");
    expect(result.status).toBe("pending");
  });

  it("confirma sem isDirectDebit — DTO tem isDirectDebit=false por omissão", async () => {
    const draft = makeDraftInvoice();
    await invoiceRepo.save(draft);

    const result = await useCase.execute({ id: draft.id });

    expect(result.isDirectDebit).toBe(false);
    expect(result.directDebitDate).toBeNull();
  });

  it("o DTO da fatura inclui costCenterCategoryId", async () => {
    const draft = makeDraftInvoice();
    await invoiceRepo.save(draft);

    const result = await useCase.execute({
      id: draft.id,
      costCenterCategoryId: "cat-pes",
    });

    expect(result.costCenterCategoryId).toBe("cat-pes");
  });

  // ── Feature: guardar hint após confirmação ────────────────────────────────

  it("guarda hint nome→fornecedor ao confirmar com supplierId", async () => {
    const draft = makeDraftInvoice({ supplierName: "Makro Portugal SA" });
    await invoiceRepo.save(draft);

    await useCase.execute({ id: draft.id, supplierId: "sup-1" });

    // Nome normalizado (sem "SA", sem pontuação) deve estar guardado
    expect(supplierHint.saved.get("makro portugal")).toBe("sup-1");
  });

  it("guarda hint com ID do fornecedor recém-criado", async () => {
    const draft = makeDraftInvoice({ supplierId: undefined, supplierName: "Novo Fornecedor Lda" });
    await invoiceRepo.save(draft);

    await useCase.execute({
      id: draft.id,
      newSupplier: { name: "Novo Fornecedor Lda", nif: "123456789" },
    });

    const savedId = supplierHint.saved.get("novo fornecedor");
    expect(savedId).toMatch(/^supplier-/);
  });

  it("não guarda hint quando nenhum fornecedor é atribuído", async () => {
    const draft = makeDraftInvoice({ supplierId: undefined });
    await invoiceRepo.save(draft);

    // Confirmar sem fornecer supplierId nem newSupplier
    await useCase.execute({ id: draft.id });

    expect(supplierHint.saved.size).toBe(0);
  });

  // ── Feature: lineDetailMode automático ───────────────────────────────────

  it("define lineDetailMode como 'detailed' quando são fornecidas linhas na confirmação", async () => {
    const draft = makeDraftInvoice();
    await invoiceRepo.save(draft);

    const result = await useCase.execute({
      id: draft.id,
      lines: [
        {
          description: "Farinha T55",
          quantity: 10,
          unitCostWithoutVat: 8000,
          vatRate: 6,
          vatAmount: 480,
          totalWithVat: 8480,
        },
      ],
    });

    expect(result.lineDetailMode).toBe("detailed");
  });

  it("mantém lineDetailMode 'simple' quando não são fornecidas linhas", async () => {
    const draft = makeDraftInvoice();
    await invoiceRepo.save(draft);

    const result = await useCase.execute({ id: draft.id });

    expect(result.lineDetailMode).toBe("simple");
  });

  it("persiste lineDetailMode 'detailed' no repositório quando há linhas", async () => {
    const draft = makeDraftInvoice();
    await invoiceRepo.save(draft);

    await useCase.execute({
      id: draft.id,
      lines: [
        {
          description: "Produto",
          quantity: 1,
          unitCostWithoutVat: 5000,
          vatRate: 23,
          vatAmount: 1150,
          totalWithVat: 6150,
        },
      ],
    });

    const saved = await invoiceRepo.findById(draft.id);
    expect(saved?.lineDetailMode).toBe("detailed");
  });
});
