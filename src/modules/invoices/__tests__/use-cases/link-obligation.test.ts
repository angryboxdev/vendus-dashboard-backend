import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { LinkObligationUseCase } from "../../application/use-cases/link-obligation.use-case.js";
import { ReadPaymentDocumentUseCase } from "../../application/use-cases/read-payment-document.use-case.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { NotAPaymentDocumentError, ObligationLinkMismatchError } from "../../domain/errors.js";
import type { PdfContent } from "../../domain/entities/invoice-reading.js";
import type { ExistingObligation } from "../../domain/services/reading/obligation-match.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeDocumentStoragePort } from "../fakes/fake-document-storage.port.js";
import { FakeSupplierLookupPort } from "../fakes/fake-supplier-lookup.port.js";
import { FakeInvoiceAudit } from "../fakes/fake-invoice-audit.js";
import { syntheticAt } from "../domain/reading/synthetic-payment-docs.js";
import { syntheticMakro } from "../domain/reading/synthetic-makro.js";

const ORG = mintOrganizationId("org-test");

async function setup(content: PdfContent, attachmentUrl: string | null = null) {
  const invoiceRepo = new FakeInvoiceRepository();
  const storage = new FakeDocumentStoragePort();
  // Obrigação lançada antes como fatura, com 2 dígitos trocados no número (caso real do leitor antigo).
  const old = Invoice.createFromImport({
    supplierId: null, supplierName: "DGTF", supplierNifSnapshot: null, invoiceNumber: "12345687901", invoiceDate: new Date("2026-11-05"), dueDate: new Date("2026-11-20"),
    subtotalWithoutVat: 25000, totalVat: 0, totalWithVat: 25000, source: "pdf_import", attachmentUrl, aiConfidence: 0.7, requiresReview: false,
    costCenterGroupId: null, costCenterCategoryId: null, financialType: null,
  }).setStatus("paid");
  await invoiceRepo.save(ORG, old);
  const existing: ExistingObligation[] = [{ source: "invoice", id: old.id, invoiceId: old.id, label: old.invoiceNumber, supplierName: "DGTF", amountCents: 25000, dueDate: "2026-11-20", documentDate: null, status: "paid" }];
  const read = new ReadPaymentDocumentUseCase(
    { read: async () => content, readBarcode: async () => ({ status: "absent" }), extractLogo: async () => null },
    { find: async () => existing },
    new FakeSupplierLookupPort(),
    { getNif: async () => "999999990" },
    () => "2026-11-10",
  );
  const uc = new LinkObligationUseCase(read, invoiceRepo, storage, new FakeInvoiceAudit());
  const run = (invoiceId = old.id) => uc.execute({ organizationId: ORG, invoiceId, fileBuffer: Buffer.from("pdf"), filename: "retencao.pdf", mimeType: "application/pdf", actor: "fin@teste.pt" });
  return { run, invoiceRepo, storage, old };
}

describe("LinkObligationUseCase", () => {
  test("o registo antigo passa a obrigação (referência e período), fica com o PDF; valores, número e estado não mudam", async () => {
    const s = await setup(syntheticAt());
    const dto = await s.run();
    expect(dto).toMatchObject({
      id: s.old.id, invoiceNumber: "12345687901", totalWithVat: 25000, status: "paid",
      obligation: { kind: "tax_obligation", paymentReference: "123456789012345", period: "2026-10" },
    });
    expect(s.storage.storedFiles).toHaveLength(1);
    expect(dto.attachmentUrl).toBeTruthy();
  });

  test("com anexo já existente não guarda outra cópia do PDF", async () => {
    const s = await setup(syntheticAt(), "https://armazenamento.invalid/antigo.pdf");
    const dto = await s.run();
    expect(s.storage.storedFiles).toHaveLength(0);
    expect(dto.attachmentUrl).toBe("https://armazenamento.invalid/antigo.pdf");
  });

  test("registo que a procura não aponta, ou ficheiro que não é documento de cobrança → recusa", async () => {
    const s = await setup(syntheticAt());
    const other = Invoice.createFromImport({
      supplierId: null, supplierName: "Makro", supplierNifSnapshot: null, invoiceNumber: "FT 9", invoiceDate: new Date("2026-11-01"), dueDate: null,
      subtotalWithoutVat: 100, totalVat: 23, totalWithVat: 123, source: "pdf_import", attachmentUrl: null, aiConfidence: 1, requiresReview: false,
      costCenterGroupId: null, costCenterCategoryId: null, financialType: null,
    });
    await s.invoiceRepo.save(ORG, other);
    await expect(s.run(other.id)).rejects.toBeInstanceOf(ObligationLinkMismatchError);
    const notPayment = await setup(syntheticMakro());
    await expect(notPayment.run()).rejects.toBeInstanceOf(NotAPaymentDocumentError);
  });
});
