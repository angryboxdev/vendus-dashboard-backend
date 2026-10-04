import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CancelEmptyStockPurchaseReviewsUseCase } from "../../application/use-cases/cancel-empty-stock-purchase-reviews.use-case.js";
import { FakeStockPurchaseReviewRepository } from "../fakes/fake-stock-purchase-review-repository.js";
import { FakeStockReviewAuditLog } from "../fakes/fake-stock-review-audit-log.js";
import { StockPurchaseReview } from "../../domain/entities/stock-purchase-review.js";
import { StockReviewLine } from "../../domain/entities/stock-review-line.js";

const ORG = mintOrganizationId("org-test");

function makeReview(overrides: Partial<Parameters<typeof StockPurchaseReview.create>[0]> = {}) {
  return StockPurchaseReview.create({
    organizationId: ORG,
    invoiceId: `inv-${Math.random()}`,
    sourceInvoiceVersion: 1,
    sourceHash: "hash",
    decisionSource: "unresolved",
    decisionPolicyUsed: "no_signal",
    supplierName: "Justdrinks Lda",
    invoiceNumber: "NC-1",
    invoiceDate: "2026-09-20",
    ...overrides,
  });
}

describe("CancelEmptyStockPurchaseReviewsUseCase", () => {
  it("cancela revisões não-terminais sem nenhuma linha", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const auditLog = new FakeStockReviewAuditLog();
    const stuck = makeReview();
    repository.seedReview(stuck);

    const useCase = new CancelEmptyStockPurchaseReviewsUseCase(repository, auditLog);
    const result = await useCase.execute({ organizationId: ORG, actor: "raul@angrybox.pt" });

    expect(result.cancelledCount).toBe(1);
    expect(result.cancelled[0]?.id).toBe(stuck.id);
    const persisted = await repository.findById(ORG, stuck.id);
    expect(persisted?.status).toBe("cancelled");
    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0]?.action).toBe("cancel");
    expect(auditLog.entries[0]?.reason).toMatch(/sem linhas/i);
  });

  it("nunca toca numa revisão com linhas, mesmo não resolvidas", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const auditLog = new FakeStockReviewAuditLog();
    const withLines = makeReview();
    repository.seedReview(withLines);
    repository.seedLines([
      StockReviewLine.create({
        organizationId: ORG,
        reviewId: withLines.id,
        invoiceLineId: "line-1",
        description: "Mozzarella",
        purchaseQuantity: 2,
        purchaseUnit: "un",
        unitCostWithoutVat: 1000,
        totalWithVat: 2460,
      }),
    ]);

    const useCase = new CancelEmptyStockPurchaseReviewsUseCase(repository, auditLog);
    const result = await useCase.execute({ organizationId: ORG, actor: "raul@angrybox.pt" });

    expect(result.cancelledCount).toBe(0);
    const persisted = await repository.findById(ORG, withLines.id);
    expect(persisted?.status).toBe("pending");
    expect(auditLog.entries).toHaveLength(0);
  });

  it("nunca toca numa revisão já applied ou já cancelled, mesmo sem linhas", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const auditLog = new FakeStockReviewAuditLog();
    const alreadyCancelled = makeReview().cancel("Motivo anterior");
    repository.seedReview(alreadyCancelled);

    const useCase = new CancelEmptyStockPurchaseReviewsUseCase(repository, auditLog);
    const result = await useCase.execute({ organizationId: ORG, actor: "raul@angrybox.pt" });

    expect(result.cancelledCount).toBe(0);
    expect(auditLog.entries).toHaveLength(0);
  });

  it("cancela várias revisões sem linhas numa só chamada", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const auditLog = new FakeStockReviewAuditLog();
    const a = makeReview({ invoiceNumber: "NC-1" });
    const b = makeReview({ invoiceNumber: "NC-2" });
    repository.seedReview(a);
    repository.seedReview(b);

    const useCase = new CancelEmptyStockPurchaseReviewsUseCase(repository, auditLog);
    const result = await useCase.execute({ organizationId: ORG, actor: "raul@angrybox.pt" });

    expect(result.cancelledCount).toBe(2);
    expect(new Set(result.cancelled.map((r) => r.id))).toEqual(new Set([a.id, b.id]));
  });
});
