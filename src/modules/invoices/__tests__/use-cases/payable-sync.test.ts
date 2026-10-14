import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { UpdateInvoiceUseCase } from "../../application/use-cases/update-invoice.use-case.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoicePayableSettledError } from "../../domain/errors.js";
import { FakeFiscalIdentityPort } from "../fakes/fake-fiscal-identity.port.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { FakeInvoiceReconciliationCleanup } from "../fakes/fake-invoice-reconciliation-cleanup.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceStockReviewDraftDelete } from "../fakes/fake-invoice-stock-review-draft-delete.js";
import { FakeInvoiceStockReviewStatusRead } from "../fakes/fake-invoice-stock-review-status-read.js";
import { FakePayableEntryWrite } from "../fakes/fake-payable-entry-write.js";
import { FakeSupplierLookupPort } from "../fakes/fake-supplier-lookup.port.js";

const ORG = mintOrganizationId("org-test");
const base = () =>
  Invoice.createFromImport({ supplierName: "Fornecedor Teste", supplierNifSnapshot: "503504564", invoiceNumber: "FT 1/1", invoiceDate: new Date("2026-10-01"), dueDate: new Date("2026-10-31"), subtotalWithoutVat: 16260, totalVat: 3740, totalWithVat: 20000, source: "pdf_import", attachmentUrl: null, aiConfidence: 0.9, requiresReview: false });

function setup() {
  const repo = new FakeInvoiceRepository();
  const payables = new FakePayableEntryWrite();
  const uc = new UpdateInvoiceUseCase(repo, new FakeInvoiceLineRepository(), payables, new FakeInvoiceReconciliationCleanup(), new FakeInvoiceStockReviewStatusRead(), new FakeInvoiceStockReviewDraftDelete(), new FakeFiscalIdentityPort(), new FakeSupplierLookupPort());
  return { repo, payables, uc };
}

describe("Uma obrigação por documento (F1 · 03)", () => {
  test("total/vencimento alterados numa fatura finalizada acompanham a conta a pagar em aberto (sem criar outra)", async () => {
    const { repo, payables, uc } = setup();
    const inv = base().confirmImport({});
    await repo.save(ORG, inv);
    payables.statusByInvoice.set(inv.id, "open");
    await uc.execute({ organizationId: ORG, id: inv.id, totalWithVat: 21000, dueDate: "2026-11-15" });
    expect(payables.synced).toEqual([{ invoiceId: inv.id, amount: 21000, dueDate: new Date("2026-11-15") }]);
    expect(payables.created).toEqual([]);
  });

  test("conta a pagar já paga: mudar o total é recusado (corrigir por NC/ajuste) e nada é gravado", async () => {
    const { repo, payables, uc } = setup();
    const inv = base().confirmImport({});
    await repo.save(ORG, inv);
    payables.statusByInvoice.set(inv.id, "settled");
    await expect(uc.execute({ organizationId: ORG, id: inv.id, totalWithVat: 15000 })).rejects.toBeInstanceOf(InvoicePayableSettledError);
    expect((await repo.findById(ORG, inv.id))!.totalWithVat).toBe(20000);
    expect(payables.synced).toEqual([]);
  });

  test("rascunho não mexe em contas a pagar", async () => {
    const { repo, payables, uc } = setup();
    const inv = base();
    await repo.save(ORG, inv);
    await uc.execute({ organizationId: ORG, id: inv.id, totalWithVat: 15000 });
    expect(payables.synced).toEqual([]);
  });
});
