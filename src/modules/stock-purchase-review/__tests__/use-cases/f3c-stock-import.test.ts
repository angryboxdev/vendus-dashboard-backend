import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockPurchaseReview } from "../../domain/entities/stock-purchase-review.js";
import { StockReviewLine } from "../../domain/entities/stock-review-line.js";
import { RecordInvoiceFinalizedForStockUseCase } from "../../application/use-cases/record-invoice-finalized-for-stock.use-case.js";
import { ConfirmStockPurchaseReviewUseCase } from "../../application/use-cases/confirm-stock-purchase-review.use-case.js";
import { computeInvoiceSourceHash } from "../../application/use-cases/shared.js";
import { StockImportNotValidatedError } from "../../domain/errors.js";
import { FakeStockMovementWrite } from "../fakes/fake-stock-movement-write.js";
import { FakeCostCenterCategoryRead } from "../fakes/fake-cost-center-category-read.js";
import { FakeSupplierRead } from "../fakes/fake-supplier-read.js";
import { FakeStockPurchaseReviewRepository } from "../fakes/fake-stock-purchase-review-repository.js";
import { FakeInvoiceRead, invoiceSnapshotStub } from "../fakes/fake-invoice-read.js";
import { FakeLocationRead } from "../fakes/fake-location-read.js";
import { FakeStockReviewAuditLog } from "../fakes/fake-stock-review-audit-log.js";

const ORG = mintOrganizationId("org-test");

const command = (over: Partial<Parameters<RecordInvoiceFinalizedForStockUseCase["execute"]>[0]> = {}) => ({
  organizationId: ORG, invoiceId: "inv-1", invoiceNumber: "FT 1", invoiceDate: "2026-10-20", supplierId: null, supplierName: "Makro", supplierNif: null,
  override: "auto" as const, overrideReason: null,
  lines: [{ id: "l1", description: "Farinha", quantity: 1, unit: "saco", unitCostWithoutVat: 2500, totalWithVat: 2650, vatAmount: 150, costCenterCategoryId: null, locationId: null }],
  actor: null,
  ...over,
});

describe("F3c — revisão nascida no Stock", () => {
  test("importada no Stock: cria sempre a revisão (sem decisão por categoria/fornecedor), com origem stock", async () => {
    const movements = new FakeStockMovementWrite();
    const uc = new RecordInvoiceFinalizedForStockUseCase(movements, new FakeCostCenterCategoryRead(), new FakeSupplierRead());
    await uc.execute(command({ origin: "stock" }));
    expect(movements.calls[0]).toMatchObject({ origin: "stock", decisionSource: "override", decisionPolicyUsed: "stock_import" });
  });

  test("Financeiro lança e decide «não afeta» → acaba a pendência sem criar revisão", async () => {
    const movements = new FakeStockMovementWrite();
    const finished: string[] = [];
    movements.finishFinancePending = async (_o, invoiceId) => void finished.push(invoiceId);
    const uc = new RecordInvoiceFinalizedForStockUseCase(movements, new FakeCostCenterCategoryRead(), new FakeSupplierRead());
    await uc.execute(command({ override: "force_skip", overrideReason: "serviço" }));
    expect(movements.calls).toHaveLength(0);
    expect(finished).toEqual(["inv-1"]);
  });

  test("entrada antes do Financeiro só com identidade e linhas conferidas", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const invoice = invoiceSnapshotStub({ id: "inv-1" });
    const hash = computeInvoiceSourceHash(invoice.invoiceNumber, invoice.invoiceDate, invoice.lines);
    const make = (supplierName: string, invoiceNetCents: number | null) => {
      const review = StockPurchaseReview.create({
        organizationId: ORG, invoiceId: "inv-1", sourceInvoiceVersion: 1, sourceHash: hash, decisionSource: "override", decisionPolicyUsed: "stock_import",
        supplierName, invoiceNumber: "FT 1", invoiceDate: "2026-10-20", invoiceNetCents, invoiceVatCents: 150, invoiceTotalCents: 2650, origin: "stock",
      }).startReview();
      const line = StockReviewLine.create({ organizationId: ORG, reviewId: review.id, invoiceLineId: "l1", description: "Farinha", purchaseQuantity: 1, purchaseUnit: "saco", unitCostWithoutVat: 2500, totalWithVat: 2650, vatAmount: 150 })
        .resolveToStockItem({ stockItemId: "item-1", conversionFactor: 25, locationId: "loc-1", isItemActive: true }, false, "g");
      const ready = review.refreshLinesProgress(true, true);
      repository.seedReview(ready);
      repository.seedLines([line]);
      return ready;
    };
    const invoiceRead = new FakeInvoiceRead();
    invoiceRead.invoices.set("inv-1", invoice);
    const uc = new ConfirmStockPurchaseReviewUseCase(repository, new FakeStockMovementWrite(repository), invoiceRead, new FakeLocationRead(), new FakeStockReviewAuditLog(), new FakeCostCenterCategoryRead());

    const unknown = make("Fornecedor desconhecido", 2500);
    expect(unknown.financePending).toBe(true);
    await expect(uc.execute({ organizationId: ORG, id: unknown.id, expectedVersion: unknown.version, actor: "g" })).rejects.toBeInstanceOf(StockImportNotValidatedError);

    const noTotals = make("Makro", null);
    await expect(uc.execute({ organizationId: ORG, id: noTotals.id, expectedVersion: noTotals.version, actor: "g" })).rejects.toThrow(/linhas têm de bater/);

    const ok = make("Makro", 2500);
    await expect(uc.execute({ organizationId: ORG, id: ok.id, expectedVersion: ok.version, actor: "g" })).resolves.toMatchObject({ status: "applied", origin: "stock", financePending: true });
  });
});
