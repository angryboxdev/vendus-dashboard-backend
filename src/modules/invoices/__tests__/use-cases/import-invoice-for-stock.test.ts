import { ImportInvoiceUseCase } from "../../application/use-cases/import-invoice.use-case.js";
import { ImportInvoiceForStockUseCase } from "../../application/use-cases/import-invoice-for-stock.use-case.js";
import { SaveInvoiceDraftUseCase } from "../../application/use-cases/save-invoice-draft.use-case.js";
import { ConfirmImportedInvoiceUseCase } from "../../application/use-cases/confirm-imported-invoice.use-case.js";
import {
  InvoiceAlreadyInStockError,
  InvoiceAlreadyInStockReviewError,
  InvoiceDraftInFinanceError,
  InvoiceExistsNotRoutedError,
  InvoiceLinesLockedByAppliedStockReviewError,
  StockReviewRemovalConfirmationRequiredError,
} from "../../domain/errors.js";
import type { InvoiceFinalizedForStockData } from "../../domain/ports/out/stock-decision-notify.port.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { FakeDocumentStoragePort } from "../fakes/fake-document-storage.port.js";
import { FakeAiExtractionPort } from "../fakes/fake-ai-extraction.port.js";
import { FakeSupplierLookupPort } from "../fakes/fake-supplier-lookup.port.js";
import { FakeSupplierHintPort } from "../fakes/fake-supplier-hint.port.js";
import { FakeOrganizationIdentityRead } from "../fakes/fake-organization-identity-read.port.js";
import { FakeFiscalIdentityPort } from "../fakes/fake-fiscal-identity.port.js";
import { FakeInvoiceAmountsWrite } from "../fakes/fake-invoice-amounts-write.js";
import { FakeCostCenterCategoryReader } from "../fakes/fake-cost-center-category-reader.js";
import { FakeInvoiceAllocationRepository } from "../fakes/fake-invoice-allocation-repository.js";
import { FakeInvoiceAudit } from "../fakes/fake-invoice-audit.js";
import { FakeInvoiceStockReviewStatusRead } from "../fakes/fake-invoice-stock-review-status-read.js";
import { FakeInvoiceStockReviewDraftDelete } from "../fakes/fake-invoice-stock-review-draft-delete.js";
import { FakePayableEntryWrite } from "../fakes/fake-payable-entry-write.js";
import { FakeSupplierCreatePort } from "../fakes/fake-supplier-create.port.js";
import { FakeStockRoutingPort } from "../fakes/fake-stock-routing.port.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { MakroLayout } from "../../domain/services/reading/makro-layout.js";
import { syntheticMakro } from "../domain/reading/synthetic-makro.js";

const ORG = mintOrganizationId("org-test");

function setup() {
  const invoiceRepo = new FakeInvoiceRepository();
  const lineRepo = new FakeInvoiceLineRepository();
  const storage = new FakeDocumentStoragePort();
  const fiscal = new FakeFiscalIdentityPort();
  const suppliers = new FakeSupplierLookupPort();
  suppliers.seed([{ id: "sup-makro", name: "Makro", nif: "502030712", defaultCostCenterGroupId: null, defaultCostCenterCategoryId: null, defaultFinancialType: null, logoUrl: "x" }]);
  const statusRead = new FakeInvoiceStockReviewStatusRead();
  const draftDelete = new FakeInvoiceStockReviewDraftDelete();
  const notified: InvoiceFinalizedForStockData[] = [];
  // Espelho do módulo de Stock: a primeira notificação cria a revisão (idempotente por fatura).
  const stockNotify = {
    notifyInvoiceFinalized: async (_o: unknown, data: InvoiceFinalizedForStockData) => {
      notified.push(data);
      if (!(await statusRead.findForInvoice(ORG, data.invoiceId))) statusRead.seed(data.invoiceId, { reviewId: `rev-${data.invoiceId}`, status: "pending" });
    },
  };
  const importInvoice = new ImportInvoiceUseCase(invoiceRepo, storage, new FakeAiExtractionPort(), suppliers, new FakeSupplierHintPort(), new FakeOrganizationIdentityRead(), fiscal, {
    pdf: { read: async () => syntheticMakro(), readBarcode: async () => ({ status: "absent" }), extractLogo: async () => null },
    layouts: [new MakroLayout()],
    readingWrite: { save: async () => {} },
    classifyLines: null,
  });
  const stockLines = { statusRead, draftDelete };
  const realSave = new SaveInvoiceDraftUseCase(invoiceRepo, lineRepo, new FakeInvoiceAmountsWrite(), new FakeCostCenterCategoryReader(), new FakeInvoiceAllocationRepository(), new FakeInvoiceAudit(), stockLines);
  // O pedido do rascunho (linhas com descontos + quadro de IVA) é o mesmo que o Financeiro reenvia ao concluir.
  const draftRequests: Parameters<SaveInvoiceDraftUseCase["execute"]>[0][] = [];
  const saveDraft = { execute: (c: Parameters<SaveInvoiceDraftUseCase["execute"]>[0]) => (draftRequests.push(c), realSave.execute(c)) };
  const uc = new ImportInvoiceForStockUseCase(importInvoice, saveDraft, invoiceRepo, lineRepo, storage, statusRead, stockNotify, fiscal, suppliers);
  const run = (routeExisting = false) => uc.execute({ organizationId: ORG, fileBuffer: Buffer.from("makro-pdf"), filename: "makro.pdf", mimeType: "application/pdf", routeExisting, actor: "stock@teste.pt" });
  const confirm = new ConfirmImportedInvoiceUseCase(invoiceRepo, lineRepo, new FakePayableEntryWrite(), new FakeSupplierCreatePort(), new FakeSupplierHintPort(), stockNotify, fiscal, suppliers, new FakeInvoiceAmountsWrite(), new FakeInvoiceAudit(), new FakeStockRoutingPort(), new FakeCostCenterCategoryReader(), new FakeInvoiceAllocationRepository(), stockLines);
  return { run, invoiceRepo, lineRepo, storage, fiscal, statusRead, draftDelete, notified, importInvoice, confirm, draftRequests };
}

describe("ImportInvoiceForStockUseCase (F3c)", () => {
  test("nova: rascunho com as linhas lidas (QR, sem IA), origem Stock, identidade reservada e revisão criada pendente do Financeiro", async () => {
    const s = setup();
    const r = await s.run();
    expect(r).toMatchObject({ kind: "created", reviewId: `rev-${r.invoiceId}` });
    const invoice = await s.invoiceRepo.findById(ORG, r.invoiceId);
    expect(invoice).toMatchObject({ status: "draft_ai", importOrigin: "stock", stockReviewOverride: "force_create", totalWithVat: 8063 });
    const lines = await s.lineRepo.findByInvoiceId(ORG, r.invoiceId);
    expect(lines).toHaveLength(5);
    expect(s.notified).toHaveLength(1);
    expect(s.notified[0]).toMatchObject({ origin: "stock", override: "force_create", subtotalWithoutVat: 6747, totalVat: 1316, totalWithVat: 8063 });
    expect(s.notified[0]!.lines.map((l) => l.id)).toEqual(lines.map((l) => l.id));
    expect(s.fiscal.claims.map((c) => c.invoiceId)).toEqual([r.invoiceId]);
  });

  test("a mesma fatura outra vez: já em Compras por rever → aponta para a revisão; já movimentada → bloqueia", async () => {
    const s = setup();
    const r = await s.run();
    await expect(s.run()).rejects.toBeInstanceOf(InvoiceAlreadyInStockReviewError);
    s.statusRead.seed(r.invoiceId, { reviewId: r.reviewId!, status: "applied" });
    const err = await s.run().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvoiceAlreadyInStockError);
    expect((err as Error).message).toMatch(/já deu entrada no Stock/);
    expect(s.notified).toHaveLength(1);
  });

  test("importação antiga do Stock (identidade só do Stock) → bloqueia e não deixa rascunho nem ficheiro", async () => {
    const s = setup();
    s.fiscal.nextCheck = { kind: "existing_stock_only", identityId: "fid-old" };
    await expect(s.run()).rejects.toBeInstanceOf(InvoiceAlreadyInStockError);
    expect(await s.invoiceRepo.findAll(ORG)).toHaveLength(0);
  });

  test("já importada no Financeiro: em rascunho → concluir lá; lançada sem Stock → oferece encaminhar (sem pendência)", async () => {
    const s = setup();
    const fin = await s.importInvoice.execute({ organizationId: ORG, fileBuffer: Buffer.from("makro-pdf"), filename: "makro.pdf", mimeType: "application/pdf" });
    await expect(s.run()).rejects.toBeInstanceOf(InvoiceDraftInFinanceError);

    const inv = await s.invoiceRepo.findById(ORG, fin.invoice.id);
    await s.invoiceRepo.update(ORG, inv!.setStatus("pending"));
    await expect(s.run()).rejects.toBeInstanceOf(InvoiceExistsNotRoutedError);
  });

  test("Financeiro conclui a fatura importada no Stock: mantém as linhas (mesmos ids) e só aplica a classificação", async () => {
    const s = setup();
    const r = await s.run();
    const stored = await s.lineRepo.findByInvoiceId(ORG, r.invoiceId);
    const req = s.draftRequests[0]!;
    const sameLines = req.lines!.map((l) => ({ ...l, costCenterCategoryId: "cat-ingred" }));
    await s.confirm.execute({ organizationId: ORG, id: r.invoiceId, lines: sameLines, ...(req.amounts && { amounts: req.amounts }), supplierId: "sup-makro" });
    const after = await s.lineRepo.findByInvoiceId(ORG, r.invoiceId);
    expect(after.map((l) => l.id)).toEqual(stored.map((l) => l.id));
    expect(after.every((l) => l.costCenterCategoryId === "cat-ingred")).toBe(true);
    // O lançamento no Financeiro notifica sem origem «stock» → acaba a pendência (sem nova revisão).
    expect(s.notified.at(-1)?.origin).toBeUndefined();
  });

  test("Financeiro muda as linhas: revisão por aplicar → pede confirmação (e descarta-a se aceite); movimentada → bloqueia", async () => {
    const s = setup();
    const r = await s.run();
    const stored = await s.lineRepo.findByInvoiceId(ORG, r.invoiceId);
    expect(stored).toHaveLength(5);
    const changed = s.draftRequests[0]!.lines!.map((l, i) => ({ ...l, quantity: i === 0 ? l.quantity + 1 : l.quantity, quantityText: null }));
    await expect(s.confirm.execute({ organizationId: ORG, id: r.invoiceId, lines: changed })).rejects.toBeInstanceOf(StockReviewRemovalConfirmationRequiredError);
    s.statusRead.seed(r.invoiceId, { reviewId: r.reviewId!, status: "applied" });
    await expect(s.confirm.execute({ organizationId: ORG, id: r.invoiceId, lines: changed, confirmRemoveStockReview: true })).rejects.toBeInstanceOf(InvoiceLinesLockedByAppliedStockReviewError);
    s.statusRead.seed(r.invoiceId, { reviewId: r.reviewId!, status: "partial" });
    await s.confirm.execute({ organizationId: ORG, id: r.invoiceId, lines: changed, confirmRemoveStockReview: true }).catch(() => undefined);
    expect(s.draftDelete.calls.map((c) => c.invoiceId)).toEqual([r.invoiceId]);
  });
});
