import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ReprocessMissingStockReviewsUseCase } from "../../application/use-cases/reprocess-missing-stock-reviews.use-case.js";
import { RecordInvoiceFinalizedForStockUseCase } from "../../application/use-cases/record-invoice-finalized-for-stock.use-case.js";
import { FakeInvoiceRead, invoiceSnapshotStub } from "../fakes/fake-invoice-read.js";
import { FakeStockPurchaseReviewRepository } from "../fakes/fake-stock-purchase-review-repository.js";
import { FakeStockMovementWrite } from "../fakes/fake-stock-movement-write.js";
import { FakeCostCenterCategoryRead } from "../fakes/fake-cost-center-category-read.js";
import { FakeSupplierRead } from "../fakes/fake-supplier-read.js";

const ORG = mintOrganizationId("org-test");

describe("ReprocessMissingStockReviewsUseCase", () => {
  it("cria a revisão em falta para uma fatura finalizada sem revisão correspondente", async () => {
    const invoiceRead = new FakeInvoiceRead();
    const repository = new FakeStockPurchaseReviewRepository();
    const stockMovementWrite = new FakeStockMovementWrite(repository);
    const categoryRead = new FakeCostCenterCategoryRead();
    const supplierRead = new FakeSupplierRead();
    supplierRead.policies.set("sup-1", "usually_creates_review");

    invoiceRead.invoices.set(
      "inv-1",
      invoiceSnapshotStub({
        id: "inv-1",
        supplierId: "sup-1",
        lines: [
          {
            id: "line-1",
            description: "Mozzarella",
            quantity: 2,
            unit: "un",
            unitCostWithoutVat: 10,
            totalWithVat: 24.6,
            costCenterCategoryId: null,
            locationId: null,
          },
        ],
      }),
    );

    const record = new RecordInvoiceFinalizedForStockUseCase(stockMovementWrite, categoryRead, supplierRead);
    const useCase = new ReprocessMissingStockReviewsUseCase(invoiceRead, repository, record);

    const result = await useCase.execute({ organizationId: ORG });

    expect(result.invoicesScanned).toBe(1);
    expect(stockMovementWrite.calls).toHaveLength(1);
  });

  it("nunca cria revisão para fatura sem linhas, mesmo sem revisão correspondente", async () => {
    const invoiceRead = new FakeInvoiceRead();
    const repository = new FakeStockPurchaseReviewRepository();
    const stockMovementWrite = new FakeStockMovementWrite(repository);
    const categoryRead = new FakeCostCenterCategoryRead();
    const supplierRead = new FakeSupplierRead();
    supplierRead.policies.set("sup-1", "usually_creates_review");

    invoiceRead.invoices.set("inv-1", invoiceSnapshotStub({ id: "inv-1", supplierId: "sup-1", lines: [] }));

    const record = new RecordInvoiceFinalizedForStockUseCase(stockMovementWrite, categoryRead, supplierRead);
    const useCase = new ReprocessMissingStockReviewsUseCase(invoiceRead, repository, record);

    const result = await useCase.execute({ organizationId: ORG });

    expect(result.invoicesScanned).toBe(1);
    expect(stockMovementWrite.calls).toHaveLength(0);
  });

  it("nunca reprocessa uma fatura que já tem revisão (idempotente)", async () => {
    const invoiceRead = new FakeInvoiceRead();
    const repository = new FakeStockPurchaseReviewRepository();
    const stockMovementWrite = new FakeStockMovementWrite(repository);
    const categoryRead = new FakeCostCenterCategoryRead();
    const supplierRead = new FakeSupplierRead();

    invoiceRead.invoices.set("inv-1", invoiceSnapshotStub({ id: "inv-1" }));
    const { StockPurchaseReview } = await import("../../domain/entities/stock-purchase-review.js");
    repository.seedReview(
      StockPurchaseReview.create({
        organizationId: ORG,
        invoiceId: "inv-1",
        sourceInvoiceVersion: 1,
        sourceHash: "hash-1",
        decisionSource: "unresolved",
        decisionPolicyUsed: "no_signal",
        supplierName: "Makro",
        invoiceNumber: "FT 1",
        invoiceDate: "2026-09-20",
      }),
    );

    const record = new RecordInvoiceFinalizedForStockUseCase(stockMovementWrite, categoryRead, supplierRead);
    const useCase = new ReprocessMissingStockReviewsUseCase(invoiceRead, repository, record);

    const result = await useCase.execute({ organizationId: ORG });

    expect(result.reviewsCreated).toBe(0);
    expect(stockMovementWrite.calls).toHaveLength(0);
  });
});
