import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateObligationDraftUseCase } from "../../application/use-cases/create-obligation-draft.use-case.js";
import { ReadPaymentDocumentUseCase } from "../../application/use-cases/read-payment-document.use-case.js";
import { ConfirmImportedInvoiceUseCase } from "../../application/use-cases/confirm-imported-invoice.use-case.js";
import { NotAPaymentDocumentError, ObligationAlreadyRegisteredError } from "../../domain/errors.js";
import type { PdfContent } from "../../domain/entities/invoice-reading.js";
import type { ExistingObligation } from "../../domain/services/reading/obligation-match.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeDocumentStoragePort } from "../fakes/fake-document-storage.port.js";
import { FakeSupplierLookupPort } from "../fakes/fake-supplier-lookup.port.js";
import { FakeFiscalIdentityPort } from "../fakes/fake-fiscal-identity.port.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { FakePayableEntryWrite } from "../fakes/fake-payable-entry-write.js";
import { FakeSupplierCreatePort } from "../fakes/fake-supplier-create.port.js";
import { FakeSupplierHintPort } from "../fakes/fake-supplier-hint.port.js";
import { FakeInvoiceAmountsWrite } from "../fakes/fake-invoice-amounts-write.js";
import { FakeInvoiceAudit } from "../fakes/fake-invoice-audit.js";
import { FakeStockRoutingPort } from "../fakes/fake-stock-routing.port.js";
import { FakeCostCenterCategoryReader } from "../fakes/fake-cost-center-category-reader.js";
import { FakeInvoiceAllocationRepository } from "../fakes/fake-invoice-allocation-repository.js";
import { syntheticAt, syntheticSs } from "../domain/reading/synthetic-payment-docs.js";
import { syntheticMakro } from "../domain/reading/synthetic-makro.js";

const ORG = mintOrganizationId("org-test");

function setup(content: PdfContent, existing: ExistingObligation[] = []) {
  const invoiceRepo = new FakeInvoiceRepository();
  const storage = new FakeDocumentStoragePort();
  const suppliers = new FakeSupplierLookupPort();
  suppliers.seed([{ id: "s-at", name: "DIRECCÃO-GERAL DO TESOURO E FINANÇAS", nif: null, defaultCostCenterGroupId: "g-adm", defaultCostCenterCategoryId: "c-imp", defaultFinancialType: null }]);
  const read = new ReadPaymentDocumentUseCase(
    { read: async () => content, readBarcode: async () => ({ status: "absent" }), extractLogo: async () => null },
    { find: async () => existing },
    suppliers,
    { getNif: async () => "999999990" },
    () => "2026-11-10",
  );
  const uc = new CreateObligationDraftUseCase(read, storage, invoiceRepo, suppliers);
  const run = (force = false) => uc.execute({ organizationId: ORG, fileBuffer: Buffer.from("pdf"), filename: "retencao.pdf", mimeType: "application/pdf", force });
  return { run, invoiceRepo, storage, suppliers };
}

describe("CreateObligationDraftUseCase (E3b-2)", () => {
  test("AT: rascunho sem IVA, sem linhas, sem Stock; prazo, referência, período e categoria do fornecedor", async () => {
    const s = setup(syntheticAt());
    const r = await s.run();
    expect(r.invoice).toMatchObject({
      status: "draft_ai", invoiceNumber: "12345678901", supplierId: "s-at", subtotalWithoutVat: 25000, totalVat: 0, totalWithVat: 25000, dueDate: "2026-11-20",
      costCenterCategoryId: "c-imp", stockReviewOverride: "force_skip",
      obligation: { kind: "tax_obligation", paymentReference: "123456789012345", mbEntity: null, period: "2026-10" },
    });
    expect(r.extractedLines).toEqual([]);
    expect(s.storage.storedFiles).toHaveLength(1);
  });

  test("SS: obrigação contributiva com entidade e referência MB (número composto pelo período e referência)", async () => {
    const r = await setup(syntheticSs()).run();
    expect(r.invoice).toMatchObject({ invoiceNumber: "SS 2026-10 098765432", supplierName: "Segurança Social", totalWithVat: 8850, obligation: { kind: "contribution_obligation", mbEntity: "12345", paymentReference: "098765432" } });
  });

  test("obrigação claramente já registada → recusa (409) sem guardar; com «force» cria", async () => {
    const existing: ExistingObligation[] = [{ source: "invoice", id: "inv-1", invoiceId: "inv-1", label: "12345678901", supplierName: "DGTF", amountCents: 25000, dueDate: "2026-11-20", documentDate: null, status: "paid" }];
    const s = setup(syntheticAt(), existing);
    await expect(s.run()).rejects.toBeInstanceOf(ObligationAlreadyRegisteredError);
    expect(s.storage.storedFiles).toHaveLength(0);
    await expect(s.run(true)).resolves.toMatchObject({ invoice: { obligation: { kind: "tax_obligation" } } });
  });

  test("ficheiro que não é documento de cobrança, ou com problemas bloqueantes → recusa", async () => {
    await expect(setup(syntheticMakro()).run()).rejects.toBeInstanceOf(NotAPaymentDocumentError);
    await expect(setup(syntheticAt({ nif: "123456789" })).run()).rejects.toThrow(/NIF do documento não é o da organização/);
  });

  test("confirmar a obrigação cria a conta a pagar sem identidade fiscal de faturas nem decisão de Stock", async () => {
    const s = setup(syntheticAt());
    const draft = await s.run();
    const fiscal = new FakeFiscalIdentityPort();
    const payables = new FakePayableEntryWrite();
    const stockRouting = new FakeStockRoutingPort();
    const confirm = new ConfirmImportedInvoiceUseCase(s.invoiceRepo, new FakeInvoiceLineRepository(), payables, new FakeSupplierCreatePort(), new FakeSupplierHintPort(), { notifyInvoiceFinalized: async () => {} }, fiscal, s.suppliers, new FakeInvoiceAmountsWrite(), new FakeInvoiceAudit(), stockRouting, new FakeCostCenterCategoryReader(), new FakeInvoiceAllocationRepository());
    const confirmed = await confirm.execute({ organizationId: ORG, id: draft.invoice.id, saveAsPayable: true });
    expect(confirmed).toMatchObject({ status: "pending", totalWithVat: 25000, obligation: { kind: "tax_obligation" } });
    expect(fiscal.claims).toEqual([]);
  });
});
