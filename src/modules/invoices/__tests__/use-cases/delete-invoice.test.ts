import { DeleteInvoiceUseCase } from "../../application/use-cases/delete-invoice.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { FakeDocumentStoragePort } from "../fakes/fake-document-storage.port.js";
import { FakePayableEntryWrite } from "../fakes/fake-payable-entry-write.js";
import { FakeInvoiceReconciliationCleanup } from "../fakes/fake-invoice-reconciliation-cleanup.js";
import { FakeInvoiceStockReviewStatusRead } from "../fakes/fake-invoice-stock-review-status-read.js";
import { FakeInvoiceStockReviewDraftDelete } from "../fakes/fake-invoice-stock-review-draft-delete.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import {
  InvoiceNotFoundError,
  InvoiceLinesLockedByAppliedStockReviewError,
  StockReviewRemovalConfirmationRequiredError,
} from "../../domain/errors.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG_ID = mintOrganizationId("org-test");

const makeInvoice = () =>
  Invoice.create({
    supplierName: "Makro",
    invoiceNumber: "MKR-001",
    invoiceDate: new Date("2026-06-01"),
    subtotalWithoutVat: 100000,
    totalVat: 23000,
    totalWithVat: 123000,
  });

describe("DeleteInvoiceUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let lineRepo: FakeInvoiceLineRepository;
  let storage: FakeDocumentStoragePort;
  let payableWrite: FakePayableEntryWrite;
  let reconciliationCleanup: FakeInvoiceReconciliationCleanup;
  let stockReviewStatusRead: FakeInvoiceStockReviewStatusRead;
  let stockReviewDraftDelete: FakeInvoiceStockReviewDraftDelete;
  let useCase: DeleteInvoiceUseCase;

  beforeEach(() => {
    invoiceRepo = new FakeInvoiceRepository();
    lineRepo = new FakeInvoiceLineRepository();
    storage = new FakeDocumentStoragePort();
    payableWrite = new FakePayableEntryWrite();
    reconciliationCleanup = new FakeInvoiceReconciliationCleanup();
    stockReviewStatusRead = new FakeInvoiceStockReviewStatusRead();
    stockReviewDraftDelete = new FakeInvoiceStockReviewDraftDelete();
    useCase = new DeleteInvoiceUseCase(
      invoiceRepo,
      lineRepo,
      storage,
      payableWrite,
      reconciliationCleanup,
      stockReviewStatusRead,
      stockReviewDraftDelete,
    );
  });

  it("elimina a fatura do repositório", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(ORG_ID, inv);

    await useCase.execute({ organizationId: ORG_ID, id: inv.id });

    const found = await invoiceRepo.findById(ORG_ID, inv.id);
    expect(found).toBeNull();
  });

  it("elimina as linhas associadas à fatura", async () => {
    const inv = makeInvoice();
    const line = InvoiceLine.create({
      invoiceId: inv.id,
      description: "Produto X",
      quantity: 5,
      unitCostWithoutVat: 20000,
      vatRate: 23,
      vatAmount: 23000,
      totalWithVat: 123000,
    });
    await invoiceRepo.save(ORG_ID, inv);
    await lineRepo.saveAll(ORG_ID, [line]);

    await useCase.execute({ organizationId: ORG_ID, id: inv.id });

    const lines = await lineRepo.findByInvoiceId(ORG_ID, inv.id);
    expect(lines).toHaveLength(0);
  });

  it("elimina o ficheiro anexado quando a fatura tem attachmentUrl", async () => {
    const inv = Invoice.createFromImport({
      supplierId: null,
      supplierName: "EDP",
      supplierNifSnapshot: null,
      invoiceNumber: "EDP-001",
      invoiceDate: new Date("2026-06-01"),
      dueDate: null,
      subtotalWithoutVat: 100000,
      totalVat: 23000,
      totalWithVat: 123000,
      source: "pdf_import",
      attachmentUrl: "https://storage.example.com/invoices/doc.pdf",
      aiConfidence: 0.9,
      requiresReview: false,
      currency: "EUR",
    });
    await invoiceRepo.save(ORG_ID, inv);

    await useCase.execute({ organizationId: ORG_ID, id: inv.id });

    expect(storage.deletedUrls).toContain("https://storage.example.com/invoices/doc.pdf");
  });

  it("não chama delete no storage quando a fatura não tem anexo", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(ORG_ID, inv);

    await useCase.execute({ organizationId: ORG_ID, id: inv.id });

    expect(storage.deletedUrls).toHaveLength(0);
  });

  it("lança InvoiceNotFoundError para id inexistente", async () => {
    await expect(useCase.execute({ organizationId: ORG_ID, id: "nao-existe" })).rejects.toThrow(
      InvoiceNotFoundError,
    );
  });

  it("cancela o payable associado antes de apagar a fatura", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(ORG_ID, inv);

    await useCase.execute({ organizationId: ORG_ID, id: inv.id });

    expect(payableWrite.cancelled).toContain(inv.id);
  });

  it("remove os links de reconciliação antes de apagar a fatura", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(ORG_ID, inv);

    await useCase.execute({ organizationId: ORG_ID, id: inv.id });

    expect(reconciliationCleanup.removedInvoiceIds).toContain(inv.id);
  });

  describe("guarda contra revisão de stock (D10, stock-purchase-review)", () => {
    it("prossegue normalmente quando não há revisão de stock associada", async () => {
      const inv = makeInvoice();
      await invoiceRepo.save(ORG_ID, inv);

      await useCase.execute({ organizationId: ORG_ID, id: inv.id });

      const found = await invoiceRepo.findById(ORG_ID, inv.id);
      expect(found).toBeNull();
      expect(stockReviewDraftDelete.calls).toHaveLength(0);
    });

    it("lança StockReviewRemovalConfirmationRequiredError quando há revisão pendente e não há confirmação", async () => {
      const inv = makeInvoice();
      await invoiceRepo.save(ORG_ID, inv);
      stockReviewStatusRead.seed(inv.id, { reviewId: "rev-1", status: "pending" });

      await expect(useCase.execute({ organizationId: ORG_ID, id: inv.id })).rejects.toThrow(
        StockReviewRemovalConfirmationRequiredError,
      );
      expect(stockReviewDraftDelete.calls).toHaveLength(0);
      const found = await invoiceRepo.findById(ORG_ID, inv.id);
      expect(found).not.toBeNull();
    });

    it("com confirmação, apaga o rascunho e prossegue quando a revisão ainda não foi aplicada", async () => {
      const inv = makeInvoice();
      await invoiceRepo.save(ORG_ID, inv);
      stockReviewStatusRead.seed(inv.id, { reviewId: "rev-1", status: "in_review" });

      await useCase.execute({ organizationId: ORG_ID, id: inv.id, confirmRemoveStockReview: true });

      expect(stockReviewDraftDelete.calls).toHaveLength(1);
      expect(stockReviewDraftDelete.calls[0]?.invoiceId).toBe(inv.id);
      const found = await invoiceRepo.findById(ORG_ID, inv.id);
      expect(found).toBeNull();
    });

    it("bloqueia sempre com InvoiceLinesLockedByAppliedStockReviewError quando a revisão já foi aplicada, mesmo com confirmação", async () => {
      const inv = makeInvoice();
      await invoiceRepo.save(ORG_ID, inv);
      stockReviewStatusRead.seed(inv.id, { reviewId: "rev-1", status: "applied" });

      await expect(
        useCase.execute({ organizationId: ORG_ID, id: inv.id, confirmRemoveStockReview: true }),
      ).rejects.toThrow(InvoiceLinesLockedByAppliedStockReviewError);
      expect(stockReviewDraftDelete.calls).toHaveLength(0);
      const found = await invoiceRepo.findById(ORG_ID, inv.id);
      expect(found).not.toBeNull();
    });
  });
});
