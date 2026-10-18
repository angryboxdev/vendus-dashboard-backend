import { FakeCostCenterCategoryReader } from "../fakes/fake-cost-center-category-reader.js";
import { FakeInvoiceAllocationRepository } from "../fakes/fake-invoice-allocation-repository.js";
import { FakeStockRoutingPort } from "../fakes/fake-stock-routing.port.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ConfirmImportedInvoiceUseCase } from "../../application/use-cases/confirm-imported-invoice.use-case.js";
import { CreateInvoiceUseCase } from "../../application/use-cases/create-invoice.use-case.js";
import { DeleteInvoiceUseCase } from "../../application/use-cases/delete-invoice.use-case.js";
import { UpdateInvoiceUseCase } from "../../application/use-cases/update-invoice.use-case.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceVersionConflictError } from "../../domain/errors.js";
import { FakeDocumentStoragePort } from "../fakes/fake-document-storage.port.js";
import { FakeFiscalIdentityPort } from "../fakes/fake-fiscal-identity.port.js";
import { FakeInvoiceAmountsWrite } from "../fakes/fake-invoice-amounts-write.js";
import { FakeInvoiceAudit } from "../fakes/fake-invoice-audit.js";
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
const draft = () =>
  Invoice.createFromImport({
    supplierName: "Fornecedor Teste",
    supplierNifSnapshot: "503504564",
    invoiceNumber: "FT 2026/1",
    invoiceDate: new Date("2026-10-01"),
    dueDate: new Date("2026-10-31"),
    subtotalWithoutVat: 10000,
    totalVat: 2300,
    totalWithVat: 12300,
    source: "pdf_import",
    attachmentUrl: null,
    aiConfidence: 0.9,
    requiresReview: false,
  });

function setup() {
  const invoiceRepo = new FakeInvoiceRepository();
  const lineRepo = new FakeInvoiceLineRepository();
  const payableWrite = new FakePayableEntryWrite();
  const audit = new FakeInvoiceAudit();
  const fiscal = new FakeFiscalIdentityPort();
  const suppliers = new FakeSupplierLookupPort();
  const update = new UpdateInvoiceUseCase(invoiceRepo, lineRepo, payableWrite, new FakeInvoiceReconciliationCleanup(), new FakeInvoiceStockReviewStatusRead(), new FakeInvoiceStockReviewDraftDelete(), fiscal, suppliers, audit, new FakeInvoiceAllocationRepository());
  const confirm = new ConfirmImportedInvoiceUseCase(invoiceRepo, lineRepo, payableWrite, new FakeSupplierCreatePort(), new FakeSupplierHintPort(), notify, fiscal, suppliers, new FakeInvoiceAmountsWrite(), audit, new FakeStockRoutingPort(), new FakeCostCenterCategoryReader(), new FakeInvoiceAllocationRepository());
  const create = new CreateInvoiceUseCase(invoiceRepo, lineRepo, payableWrite, notify, fiscal, suppliers, new FakeInvoiceAmountsWrite(), audit, new FakeStockRoutingPort(), new FakeCostCenterCategoryReader(), new FakeInvoiceAllocationRepository());
  const del = new DeleteInvoiceUseCase(invoiceRepo, lineRepo, new FakeDocumentStoragePort(), payableWrite, new FakeInvoiceReconciliationCleanup(), new FakeInvoiceStockReviewStatusRead(), new FakeInvoiceStockReviewDraftDelete(), fiscal, audit);
  return { invoiceRepo, audit, update, confirm, create, del };
}

describe("Faturas: versão (bloqueio otimista) e auditoria (F1 §1.4)", () => {
  test("cada escrita incrementa a versão; edição com versão antiga → 409 e nada muda", async () => {
    const s = setup();
    const inv = draft();
    await s.invoiceRepo.save(ORG, inv);
    const r1 = await s.update.execute({ organizationId: ORG, id: inv.id, expectedVersion: 1, notes: "a" });
    expect(r1.version).toBe(2);
    const err = await s.update.execute({ organizationId: ORG, id: inv.id, expectedVersion: 1, notes: "b" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvoiceVersionConflictError);
    expect(err).toMatchObject({ currentVersion: 2 });
    expect((await s.invoiceRepo.findById(ORG, inv.id))!.notes).toBe("a");
  });

  test("corrida: a versão já mudou entre a leitura e a escrita → só uma passa", async () => {
    const s = setup();
    const inv = draft();
    await s.invoiceRepo.save(ORG, inv);
    // Simula outra escrita a passar à frente depois da leitura do caso de uso.
    const orig = s.invoiceRepo.claimVersion.bind(s.invoiceRepo);
    s.invoiceRepo.claimVersion = async (o, id, _expected) => {
      await orig(o, id, null);
      return orig(o, id, 1);
    };
    await expect(s.update.execute({ organizationId: ORG, id: inv.id, notes: "x" })).rejects.toBeInstanceOf(InvoiceVersionConflictError);
  });

  test("confirmar duas vezes o mesmo rascunho com a mesma versão: a segunda é recusada", async () => {
    const s = setup();
    const inv = draft();
    await s.invoiceRepo.save(ORG, inv);
    await s.confirm.execute({ organizationId: ORG, id: inv.id, expectedVersion: 1 });
    await expect(s.confirm.execute({ organizationId: ORG, id: inv.id, expectedVersion: 1 })).rejects.toBeInstanceOf(InvoiceVersionConflictError);
  });

  test("auditoria: autor, origem, antes/depois e motivo em criar, confirmar, editar e apagar", async () => {
    const s = setup();
    const created = await s.create.execute({ organizationId: ORG, actor: "gestor@exemplo.pt", supplierName: "Fornecedor Teste", invoiceNumber: "FT 9", invoiceDate: "2026-10-01", subtotalWithoutVat: 100, totalVat: 23, totalWithVat: 123 });
    const inv = draft();
    await s.invoiceRepo.save(ORG, inv);
    await s.confirm.execute({ organizationId: ORG, id: inv.id, actor: "gestor@exemplo.pt" });
    await s.update.execute({ organizationId: ORG, id: inv.id, actor: "gestor@exemplo.pt", dueDate: "2026-11-15", reason: "Fornecedor alargou o prazo" });
    await s.del.execute({ organizationId: ORG, id: created.id, actor: "gestor@exemplo.pt", reason: "Lançada por engano" });

    expect(s.audit.entries.map((e) => [e.action, e.origin])).toEqual([["create", "manual"], ["confirm", "import"], ["update", "manual"], ["delete", "manual"]]);
    expect(s.audit.entries.every((e) => e.actor === "gestor@exemplo.pt")).toBe(true);
    const upd = s.audit.entries[2]!;
    expect(upd.reason).toBe("Fornecedor alargou o prazo");
    expect(upd.before).toMatchObject({ dueDate: "2026-10-31" });
    expect(upd.after).toMatchObject({ dueDate: "2026-11-15" });
    expect(s.audit.entries[3]).toMatchObject({ before: { invoiceNumber: "FT 9" }, after: null, reason: "Lançada por engano" });
  });
});
