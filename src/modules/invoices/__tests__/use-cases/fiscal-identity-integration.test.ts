import { FakeInvoiceAudit } from "../fakes/fake-invoice-audit.js";
import { FakeInvoiceAmountsWrite } from "../fakes/fake-invoice-amounts-write.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ConfirmImportedInvoiceUseCase } from "../../application/use-cases/confirm-imported-invoice.use-case.js";
import { CreateInvoiceUseCase } from "../../application/use-cases/create-invoice.use-case.js";
import { DeleteInvoiceUseCase } from "../../application/use-cases/delete-invoice.use-case.js";
import { UpdateInvoiceUseCase } from "../../application/use-cases/update-invoice.use-case.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { FiscalIdentityConflictError } from "../../domain/errors.js";
import { FakeDocumentStoragePort } from "../fakes/fake-document-storage.port.js";
import { FakeFiscalIdentityPort } from "../fakes/fake-fiscal-identity.port.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { FakeInvoiceReconciliationCleanup } from "../fakes/fake-invoice-reconciliation-cleanup.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceStockReviewDraftDelete } from "../fakes/fake-invoice-stock-review-draft-delete.js";
import { FakeInvoiceStockReviewStatusRead } from "../fakes/fake-invoice-stock-review-status-read.js";
import { FakePayableEntryWrite } from "../fakes/fake-payable-entry-write.js";
import { FakeSupplierCreatePort } from "../fakes/fake-supplier-create.port.js";
import { FakeSupplierHintPort } from "../fakes/fake-supplier-hint.port.js";
import { FakeSupplierLookupPort } from "../fakes/fake-supplier-lookup.port.js";

const ORG = mintOrganizationId("org-test");
const notify = { notifyInvoiceFinalized: async () => {} };
// Dados controlados (NIF fictício com dígito de controlo válido).
const draft = (over: Partial<Parameters<typeof Invoice.createFromImport>[0]> = {}) =>
  Invoice.createFromImport({
    supplierName: "Fornecedor Teste",
    supplierNifSnapshot: "503504564",
    invoiceNumber: "FT 2026/64311",
    invoiceDate: new Date("2026-10-01"),
    dueDate: new Date("2026-10-31"),
    subtotalWithoutVat: 11160,
    totalVat: 670,
    totalWithVat: 11830,
    source: "pdf_import",
    attachmentUrl: null,
    aiConfidence: 0.9,
    requiresReview: false,
    ...over,
  });

function deps() {
  const invoiceRepo = new FakeInvoiceRepository();
  const lineRepo = new FakeInvoiceLineRepository();
  const payableWrite = new FakePayableEntryWrite();
  const fiscal = new FakeFiscalIdentityPort();
  const suppliers = new FakeSupplierLookupPort();
  return { invoiceRepo, lineRepo, payableWrite, fiscal, suppliers };
}

describe("Faturas × identidade fiscal partilhada (F1)", () => {
  test("confirmar: documento já no Financeiro → 409 com o original e o rascunho NÃO é finalizado nem gera conta a pagar", async () => {
    const d = deps();
    const uc = new ConfirmImportedInvoiceUseCase(d.invoiceRepo, d.lineRepo, d.payableWrite, new FakeSupplierCreatePort(), new FakeSupplierHintPort(), notify, d.fiscal, d.suppliers, new FakeInvoiceAmountsWrite(), new FakeInvoiceAudit());
    const inv = draft();
    await d.invoiceRepo.save(ORG, inv);
    d.fiscal.next = { kind: "existing_finance", identityId: "fid-1", existingInvoiceId: "inv-original" };
    const err = await uc.execute({ organizationId: ORG, id: inv.id, saveAsPayable: true }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FiscalIdentityConflictError);
    expect(err).toMatchObject({ code: "existing_finance", details: { existingInvoiceId: "inv-original" } });
    expect((await d.invoiceRepo.findById(ORG, inv.id))!.status).toBe("draft_ai");
    expect(d.payableWrite.created ?? []).toEqual([]);
  });

  test("confirmar: identidade incompleta fica em rascunho; o NIF do fornecedor ligado é usado quando a fatura não o tem", async () => {
    const d = deps();
    d.suppliers.seed([{ id: "sup-1", name: "Fornecedor Teste", nif: "503504564", defaultCostCenterGroupId: null, defaultCostCenterCategoryId: null, defaultFinancialType: null }]);
    const uc = new ConfirmImportedInvoiceUseCase(d.invoiceRepo, d.lineRepo, d.payableWrite, new FakeSupplierCreatePort(), new FakeSupplierHintPort(), notify, d.fiscal, d.suppliers, new FakeInvoiceAmountsWrite(), new FakeInvoiceAudit());
    const inv = draft({ supplierNifSnapshot: null });
    await d.invoiceRepo.save(ORG, inv);
    await uc.execute({ organizationId: ORG, id: inv.id, supplierId: "sup-1" });
    expect(d.fiscal.claims[0]!.input).toMatchObject({ supplierNif: "503504564", invoiceNumber: "FT 2026/64311", documentType: "invoice" });
    const inv2 = draft({ supplierNifSnapshot: null, invoiceNumber: "X" });
    await d.invoiceRepo.save(ORG, inv2);
    d.fiscal.next = { kind: "incomplete", missing: ["issuer_tax_id"] };
    await expect(uc.execute({ organizationId: ORG, id: inv2.id })).rejects.toMatchObject({ code: "identity_incomplete" });
    expect((await d.invoiceRepo.findById(ORG, inv2.id))!.status).toBe("draft_ai");
  });

  test("completar documento importado no Stock: liga ao mesmo documento e NÃO cria nova revisão de stock (sem duplicar quantidades)", async () => {
    const d = deps();
    const uc = new ConfirmImportedInvoiceUseCase(d.invoiceRepo, d.lineRepo, d.payableWrite, new FakeSupplierCreatePort(), new FakeSupplierHintPort(), notify, d.fiscal, d.suppliers, new FakeInvoiceAmountsWrite(), new FakeInvoiceAudit());
    const inv = draft();
    await d.invoiceRepo.save(ORG, inv);
    d.fiscal.next = { kind: "ok", identityId: "fid-stock", linkedToStock: true };
    const r = await uc.execute({ organizationId: ORG, id: inv.id, completeStockIdentityId: "fid-stock" });
    expect(d.fiscal.claims[0]!.opts).toMatchObject({ completeStockIdentityId: "fid-stock" });
    expect(r.stockReviewOverride).toBe("force_skip");
  });

  test("criar manualmente: conflito de identidade retira a fatura acabada de criar (nada fica finalizado)", async () => {
    const d = deps();
    const uc = new CreateInvoiceUseCase(d.invoiceRepo, d.lineRepo, d.payableWrite, notify, d.fiscal, d.suppliers, new FakeInvoiceAmountsWrite(), new FakeInvoiceAudit());
    d.fiscal.next = { kind: "possible_duplicate", candidates: [{ invoiceId: "inv-x", seriesNumber: "FT 2026/064311" }] };
    await expect(
      uc.execute({ organizationId: ORG, supplierName: "Fornecedor Teste", invoiceNumber: "FT 2026/64311", invoiceDate: "2026-10-01", dueDate: "2026-10-31", subtotalWithoutVat: 100, totalVat: 23, totalWithVat: 123 }),
    ).rejects.toMatchObject({ code: "possible_duplicate" });
    expect(await d.invoiceRepo.findAll(ORG)).toEqual([]);
    expect(d.payableWrite.created ?? []).toEqual([]);
  });

  test("corrigir número de fatura finalizada revalida a identidade; rascunho não; mudar o tipo passa a ter efeito", async () => {
    const d = deps();
    const uc = new UpdateInvoiceUseCase(d.invoiceRepo, d.lineRepo, d.payableWrite, new FakeInvoiceReconciliationCleanup(), new FakeInvoiceStockReviewStatusRead(), new FakeInvoiceStockReviewDraftDelete(), d.fiscal, d.suppliers, new FakeInvoiceAudit());
    const rascunho = draft();
    await d.invoiceRepo.save(ORG, rascunho);
    await uc.execute({ organizationId: ORG, id: rascunho.id, invoiceNumber: "FT 2026/1" });
    expect(d.fiscal.claims).toHaveLength(0);
    const final = draft().confirmImport({});
    await d.invoiceRepo.save(ORG, final);
    d.fiscal.next = { kind: "existing_finance", identityId: "fid-9", existingInvoiceId: "inv-9" };
    await expect(uc.execute({ organizationId: ORG, id: final.id, invoiceNumber: "FT 2026/9" })).rejects.toMatchObject({ code: "existing_finance" });
    expect((await d.invoiceRepo.findById(ORG, final.id))!.invoiceNumber).toBe("FT 2026/64311");
    const r = await uc.execute({ organizationId: ORG, id: final.id, documentType: "credit_note" });
    expect(r.documentType).toBe("credit_note");
  });

  test("apagar liberta a chave fiscal", async () => {
    const d = deps();
    const uc = new DeleteInvoiceUseCase(d.invoiceRepo, d.lineRepo, new FakeDocumentStoragePort(), d.payableWrite, new FakeInvoiceReconciliationCleanup(), new FakeInvoiceStockReviewStatusRead(), new FakeInvoiceStockReviewDraftDelete(), d.fiscal, new FakeInvoiceAudit());
    const inv = draft();
    await d.invoiceRepo.save(ORG, inv);
    await uc.execute({ organizationId: ORG, id: inv.id });
    expect(d.fiscal.released).toEqual([inv.id]);
  });
});
