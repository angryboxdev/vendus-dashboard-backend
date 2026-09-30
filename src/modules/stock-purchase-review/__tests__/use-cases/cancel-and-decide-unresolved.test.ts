import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockPurchaseReview } from "../../domain/entities/stock-purchase-review.js";
import { CancelStockPurchaseReviewUseCase } from "../../application/use-cases/cancel-stock-purchase-review.use-case.js";
import { DecideUnresolvedReviewUseCase } from "../../application/use-cases/decide-unresolved-review.use-case.js";
import { CancellationReasonRequiredError } from "../../domain/errors.js";
import { FakeStockPurchaseReviewRepository } from "../fakes/fake-stock-purchase-review-repository.js";
import { FakeStockReviewAuditLog } from "../fakes/fake-stock-review-audit-log.js";

const ORG = mintOrganizationId("org-test");

function seedReview(repository: FakeStockPurchaseReviewRepository, overrides: Partial<Parameters<typeof StockPurchaseReview.create>[0]> = {}) {
  const review = StockPurchaseReview.create({
    organizationId: ORG,
    invoiceId: "inv-1",
    sourceInvoiceVersion: 1,
    sourceHash: "hash-1",
    decisionSource: "unresolved",
    decisionPolicyUsed: "no_signal",
    supplierName: "Makro",
    invoiceNumber: "FT 1",
    invoiceDate: "2026-09-20",
    ...overrides,
  });
  repository.seedReview(review);
  return review;
}

describe("CancelStockPurchaseReviewUseCase", () => {
  it("exige motivo e nunca apaga a revisão", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const auditLog = new FakeStockReviewAuditLog();
    const review = seedReview(repository);
    const useCase = new CancelStockPurchaseReviewUseCase(repository, auditLog);

    await expect(
      useCase.execute({ organizationId: ORG, id: review.id, reason: "", actor: "user@fonsat.pt", expectedVersion: review.version }),
    ).rejects.toThrow(CancellationReasonRequiredError);

    const dto = await useCase.execute({
      organizationId: ORG,
      id: review.id,
      reason: "Fatura duplicada",
      actor: "user@fonsat.pt",
      expectedVersion: review.version,
    });
    expect(dto.status).toBe("cancelled");
    expect(await repository.findById(ORG, review.id)).not.toBeNull();
  });
});

describe("DecideUnresolvedReviewUseCase", () => {
  it("decide 'create' — sai de unresolved para in_review, fica auditado", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const auditLog = new FakeStockReviewAuditLog();
    const review = seedReview(repository);
    const useCase = new DecideUnresolvedReviewUseCase(repository, auditLog);

    const dto = await useCase.execute({ organizationId: ORG, reviewId: review.id, outcome: "create", actor: "user@fonsat.pt", expectedVersion: review.version });

    expect(dto.status).toBe("in_review");
    expect(dto.decisionSource).toBe("override");
    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0]?.action).toBe("decide_unresolved");
  });

  it("decide 'skip' — cancela a revisão, nunca gera movimento", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const auditLog = new FakeStockReviewAuditLog();
    const review = seedReview(repository);
    const useCase = new DecideUnresolvedReviewUseCase(repository, auditLog);

    const dto = await useCase.execute({ organizationId: ORG, reviewId: review.id, outcome: "skip", actor: "user@fonsat.pt", expectedVersion: review.version });

    expect(dto.status).toBe("cancelled");
  });
});
