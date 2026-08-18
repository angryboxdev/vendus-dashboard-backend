import { UpdateInvoiceUseCase } from "../../application/use-cases/update-invoice.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { FakePayableEntryWrite } from "../fakes/fake-payable-entry-write.js";
import { FakeInvoiceReconciliationCleanup } from "../fakes/fake-invoice-reconciliation-cleanup.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { InvoiceNotFoundError, DuplicateInvoiceError } from "../../domain/errors.js";

const makeInvoice = () =>
  Invoice.create({
    supplierName: "Makro",
    invoiceNumber: "MKR-001",
    invoiceDate: new Date("2026-06-01"),
    subtotalWithoutVat: 100000,
    totalVat: 23000,
    totalWithVat: 123000,
  });

describe("UpdateInvoiceUseCase", () => {
  let repo: FakeInvoiceRepository;
  let lineRepo: FakeInvoiceLineRepository;
  let payableWrite: FakePayableEntryWrite;
  let reconciliationCleanup: FakeInvoiceReconciliationCleanup;
  let useCase: UpdateInvoiceUseCase;

  beforeEach(() => {
    repo = new FakeInvoiceRepository();
    lineRepo = new FakeInvoiceLineRepository();
    payableWrite = new FakePayableEntryWrite();
    reconciliationCleanup = new FakeInvoiceReconciliationCleanup();
    useCase = new UpdateInvoiceUseCase(repo, lineRepo, payableWrite, reconciliationCleanup);
  });

  it("actualiza o nome do fornecedor", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    const dto = await useCase.execute({ id: inv.id, supplierName: "EDP" });
    expect(dto.supplierName).toBe("EDP");
  });

  it("actualiza número e data de fatura", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    const dto = await useCase.execute({
      id: inv.id,
      invoiceNumber: "MKR-002",
      invoiceDate: "2026-07-01",
    });
    expect(dto.invoiceNumber).toBe("MKR-002");
    expect(dto.invoiceDate).toBe("2026-07-01");
  });

  it("actualiza valores monetários", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    const dto = await useCase.execute({
      id: inv.id,
      subtotalWithoutVat: 200000,
      totalVat: 46000,
      totalWithVat: 246000,
    });
    expect(dto.subtotalWithoutVat).toBe(200000);
    expect(dto.totalVat).toBe(46000);
    expect(dto.totalWithVat).toBe(246000);
  });

  it("persiste a alteração no repositório", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    await useCase.execute({ id: inv.id, supplierName: "NOS" });

    const saved = await repo.findById(inv.id);
    expect(saved!.supplierName).toBe("NOS");
  });

  it("actualiza supplierNifSnapshot", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    const dto = await useCase.execute({ id: inv.id, supplierNifSnapshot: "500123456" });
    expect(dto.supplierNifSnapshot).toBe("500123456");
  });

  it("actualiza costCenterGroupId e financialType", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    const dto = await useCase.execute({
      id: inv.id,
      costCenterGroupId: "grp-ops",
      financialType: "fixed_opex",
    });
    expect(dto.costCenterGroupId).toBe("grp-ops");
    expect(dto.financialType).toBe("fixed_opex");
  });

  it("actualiza flags financeiras (affectsDre, affectsCashflow, affectsProfitability)", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    const dto = await useCase.execute({
      id: inv.id,
      affectsDre: false,
      affectsCashflow: false,
      affectsProfitability: false,
    });
    expect(dto.affectsDre).toBe(false);
    expect(dto.affectsCashflow).toBe(false);
    expect(dto.affectsProfitability).toBe(false);
  });

  it("lança InvoiceNotFoundError para id inexistente", async () => {
    await expect(
      useCase.execute({ id: "nao-existe", supplierName: "X" }),
    ).rejects.toThrow(InvoiceNotFoundError);
  });

  // ── Feature: costCenterCategoryId e propagação às linhas ─────────────────

  it("actualiza costCenterCategoryId na fatura", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    const dto = await useCase.execute({ id: inv.id, costCenterCategoryId: "cat-cmv" });
    expect(dto.costCenterCategoryId).toBe("cat-cmv");
  });

  it("propaga costCenterCategoryId às linhas existentes quando o campo é enviado", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    const line = InvoiceLine.create({
      invoiceId: inv.id,
      description: "Produto A",
      quantity: 1,
      unitCostWithoutVat: 5000,
      vatRate: 23,
      vatAmount: 1150,
      totalWithVat: 6150,
    });
    await lineRepo.saveAll([line]);

    await useCase.execute({ id: inv.id, costCenterCategoryId: "cat-pes" });

    const lines = await lineRepo.findByInvoiceId(inv.id);
    expect(lines[0].costCenterCategoryId).toBe("cat-pes");
  });

  it("propaga null às linhas quando costCenterCategoryId é explicitamente null", async () => {
    const inv = Invoice.create({
      supplierName: "Makro",
      invoiceNumber: "MKR-001",
      invoiceDate: new Date("2026-06-01"),
      subtotalWithoutVat: 100000,
      totalVat: 23000,
      totalWithVat: 123000,
      costCenterCategoryId: "cat-original",
    });
    await repo.save(inv);

    const line = InvoiceLine.create({
      invoiceId: inv.id,
      description: "Produto A",
      quantity: 1,
      unitCostWithoutVat: 5000,
      vatRate: 23,
      vatAmount: 1150,
      totalWithVat: 6150,
      costCenterCategoryId: "cat-original",
    });
    await lineRepo.saveAll([line]);

    await useCase.execute({ id: inv.id, costCenterCategoryId: null });

    const lines = await lineRepo.findByInvoiceId(inv.id);
    expect(lines[0].costCenterCategoryId).toBeNull();
  });

  // ── Direct Debit ──────────────────────────────────────────────────────────

  it("actualiza isDirectDebit e directDebitDate", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    const dto = await useCase.execute({
      id: inv.id,
      isDirectDebit: true,
      directDebitDate: "2026-09-01",
    });
    expect(dto.isDirectDebit).toBe(true);
    expect(dto.directDebitDate).toBe("2026-09-01");
  });

  it("limpa directDebitDate quando enviado como null", async () => {
    const inv = Invoice.create({
      supplierName: "EDP",
      invoiceNumber: "EDP-001",
      invoiceDate: new Date("2026-06-01"),
      subtotalWithoutVat: 85000,
      totalVat: 5100,
      totalWithVat: 90100,
      isDirectDebit: true,
      directDebitDate: new Date("2026-08-01"),
    });
    await repo.save(inv);

    const dto = await useCase.execute({ id: inv.id, isDirectDebit: false, directDebitDate: null });
    expect(dto.isDirectDebit).toBe(false);
    expect(dto.directDebitDate).toBeNull();
  });

  it("não propaga CC quando costCenterCategoryId não é enviado no comando", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    const line = InvoiceLine.create({
      invoiceId: inv.id,
      description: "Produto B",
      quantity: 1,
      unitCostWithoutVat: 5000,
      vatRate: 23,
      vatAmount: 1150,
      totalWithVat: 6150,
      costCenterCategoryId: "cat-original",
    });
    await lineRepo.saveAll([line]);

    // Atualizar outros campos, sem enviar costCenterCategoryId
    await useCase.execute({ id: inv.id, supplierName: "NOS" });

    const lines = await lineRepo.findByInvoiceId(inv.id);
    expect(lines[0].costCenterCategoryId).toBe("cat-original");
  });

  // ── Feature: validação de duplicado ao alterar o número ──────────────────

  it("lança DuplicateInvoiceError quando o novo número já existe para o mesmo NIF", async () => {
    // Invoice.create não aceita supplierNifSnapshot → usar createFromImport
    const baseProps = {
      supplierName: "Makro",
      supplierNifSnapshot: "500123456",
      dueDate: null,
      subtotalWithoutVat: 50000,
      totalVat: 11500,
      totalWithVat: 61500,
      source: "pdf_import" as const,
      attachmentUrl: null,
      aiConfidence: 0.9,
      requiresReview: false,
    };
    const existing = Invoice.createFromImport({ ...baseProps, invoiceNumber: "MKR-999", invoiceDate: new Date("2026-05-01") });
    const inv = Invoice.createFromImport({ ...baseProps, invoiceNumber: "MKR-001", invoiceDate: new Date("2026-06-01") });
    await repo.save(existing);
    await repo.save(inv);

    await expect(
      useCase.execute({ id: inv.id, invoiceNumber: "MKR-999" }),
    ).rejects.toThrow(DuplicateInvoiceError);
  });

  it("lança DuplicateInvoiceError quando o novo número já existe para o mesmo supplierId (sem NIF)", async () => {
    const existing = Invoice.create({
      supplierName: "Makro",
      supplierId: "sup-1",
      invoiceNumber: "MKR-999",
      invoiceDate: new Date("2026-05-01"),
      subtotalWithoutVat: 50000,
      totalVat: 11500,
      totalWithVat: 61500,
    });
    const inv = Invoice.create({
      supplierName: "Makro",
      supplierId: "sup-1",
      invoiceNumber: "MKR-001",
      invoiceDate: new Date("2026-06-01"),
      subtotalWithoutVat: 100000,
      totalVat: 23000,
      totalWithVat: 123000,
    });
    await repo.save(existing);
    await repo.save(inv);

    await expect(
      useCase.execute({ id: inv.id, invoiceNumber: "MKR-999" }),
    ).rejects.toThrow(DuplicateInvoiceError);
  });

  it("não lança erro de duplicado quando o número é o mesmo (sem alteração)", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    await expect(
      useCase.execute({ id: inv.id, invoiceNumber: "MKR-001", supplierName: "Makro PT" }),
    ).resolves.toBeDefined();
  });

  // ── Feature: propagação de renumber ──────────────────────────────────────

  it("propaga novo número ao payable quando o invoiceNumber muda", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    await useCase.execute({ id: inv.id, invoiceNumber: "MKR-002" });

    expect(payableWrite.renumbered).toHaveLength(1);
    expect(payableWrite.renumbered[0].invoiceId).toBe(inv.id);
    // O use case passa o novo número directamente; o adapter Supabase adiciona o prefixo "Fatura"
    expect(payableWrite.renumbered[0].newInvoiceNumber).toBe("MKR-002");
  });

  it("propaga novo label aos links de reconciliação quando o invoiceNumber muda", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    await useCase.execute({ id: inv.id, invoiceNumber: "MKR-002" });

    expect(reconciliationCleanup.renumbered).toHaveLength(1);
    expect(reconciliationCleanup.renumbered[0].invoiceId).toBe(inv.id);
    expect(reconciliationCleanup.renumbered[0].newLabel).toContain("MKR-002");
  });

  it("não propaga renumber quando invoiceNumber não é enviado no comando", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    await useCase.execute({ id: inv.id, supplierName: "NOS" });

    expect(payableWrite.renumbered).toHaveLength(0);
    expect(reconciliationCleanup.renumbered).toHaveLength(0);
  });

  it("não propaga renumber quando o número enviado é igual ao actual", async () => {
    const inv = makeInvoice(); // invoiceNumber = "MKR-001"
    await repo.save(inv);

    await useCase.execute({ id: inv.id, invoiceNumber: "MKR-001" });

    expect(payableWrite.renumbered).toHaveLength(0);
    expect(reconciliationCleanup.renumbered).toHaveLength(0);
  });
});
