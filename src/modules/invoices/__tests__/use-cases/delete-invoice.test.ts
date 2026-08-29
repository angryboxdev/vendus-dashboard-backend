import { DeleteInvoiceUseCase } from "../../application/use-cases/delete-invoice.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { FakeDocumentStoragePort } from "../fakes/fake-document-storage.port.js";
import { FakePayableEntryWrite } from "../fakes/fake-payable-entry-write.js";
import { FakeInvoiceReconciliationCleanup } from "../fakes/fake-invoice-reconciliation-cleanup.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG_ID = mintOrganizationId("org-test");

describe("DeleteInvoiceUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let lineRepo: FakeInvoiceLineRepository;
  let storage: FakeDocumentStoragePort;
  let payableWrite: FakePayableEntryWrite;
  let reconciliationCleanup: FakeInvoiceReconciliationCleanup;
  let useCase: DeleteInvoiceUseCase;

  beforeEach(() => {
    invoiceRepo = new FakeInvoiceRepository();
    lineRepo = new FakeInvoiceLineRepository();
    storage = new FakeDocumentStoragePort();
    payableWrite = new FakePayableEntryWrite();
    reconciliationCleanup = new FakeInvoiceReconciliationCleanup();
    useCase = new DeleteInvoiceUseCase(invoiceRepo, lineRepo, storage, payableWrite, reconciliationCleanup);
  });

  it("elimina a fatura do repositório", async () => {
    const inv = Invoice.create({
      supplierName: "Makro",
      invoiceNumber: "MKR-001",
      invoiceDate: new Date("2026-06-01"),
      subtotalWithoutVat: 100000,
      totalVat: 23000,
      totalWithVat: 123000,
    });
    await invoiceRepo.save(ORG_ID, inv);

    await useCase.execute(ORG_ID, inv.id);

    const found = await invoiceRepo.findById(ORG_ID, inv.id);
    expect(found).toBeNull();
  });

  it("elimina as linhas associadas à fatura", async () => {
    const inv = Invoice.create({
      supplierName: "Makro",
      invoiceNumber: "MKR-001",
      invoiceDate: new Date("2026-06-01"),
      subtotalWithoutVat: 100000,
      totalVat: 23000,
      totalWithVat: 123000,
    });
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

    await useCase.execute(ORG_ID, inv.id);

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

    await useCase.execute(ORG_ID, inv.id);

    expect(storage.deletedUrls).toContain("https://storage.example.com/invoices/doc.pdf");
  });

  it("não chama delete no storage quando a fatura não tem anexo", async () => {
    const inv = Invoice.create({
      supplierName: "Makro",
      invoiceNumber: "MKR-001",
      invoiceDate: new Date("2026-06-01"),
      subtotalWithoutVat: 100000,
      totalVat: 23000,
      totalWithVat: 123000,
    });
    await invoiceRepo.save(ORG_ID, inv);

    await useCase.execute(ORG_ID, inv.id);

    expect(storage.deletedUrls).toHaveLength(0);
  });

  it("lança InvoiceNotFoundError para id inexistente", async () => {
    await expect(useCase.execute(ORG_ID, "nao-existe")).rejects.toThrow(InvoiceNotFoundError);
  });

  it("cancela o payable associado antes de apagar a fatura", async () => {
    const inv = Invoice.create({
      supplierName: "Makro",
      invoiceNumber: "MKR-001",
      invoiceDate: new Date("2026-06-01"),
      subtotalWithoutVat: 100000,
      totalVat: 23000,
      totalWithVat: 123000,
    });
    await invoiceRepo.save(ORG_ID, inv);

    await useCase.execute(ORG_ID, inv.id);

    expect(payableWrite.cancelled).toContain(inv.id);
  });

  it("remove os links de reconciliação antes de apagar a fatura", async () => {
    const inv = Invoice.create({
      supplierName: "Makro",
      invoiceNumber: "MKR-001",
      invoiceDate: new Date("2026-06-01"),
      subtotalWithoutVat: 100000,
      totalVat: 23000,
      totalWithVat: 123000,
    });
    await invoiceRepo.save(ORG_ID, inv);

    await useCase.execute(ORG_ID, inv.id);

    expect(reconciliationCleanup.removedInvoiceIds).toContain(inv.id);
  });
});
