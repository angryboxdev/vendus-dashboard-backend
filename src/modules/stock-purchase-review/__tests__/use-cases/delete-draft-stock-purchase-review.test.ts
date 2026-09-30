import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockPurchaseReview } from "../../domain/entities/stock-purchase-review.js";
import { DeleteDraftStockPurchaseReviewUseCase } from "../../application/use-cases/delete-draft-stock-purchase-review.use-case.js";
import { GetStockPurchaseReviewStatusForInvoiceUseCase } from "../../application/use-cases/get-stock-purchase-review-status-for-invoice.use-case.js";
import { ReviewAlreadyAppliedError } from "../../domain/errors.js";
import { FakeStockPurchaseReviewRepository } from "../fakes/fake-stock-purchase-review-repository.js";
import { FakeStockReviewAuditLog } from "../fakes/fake-stock-review-audit-log.js";

const ORG = mintOrganizationId("org-test");

function seedReview(repository: FakeStockPurchaseReviewRepository, overrides: Partial<Parameters<typeof StockPurchaseReview.create>[0]> = {}) {
  const review = StockPurchaseReview.create({
    organizationId: ORG,
    invoiceId: "inv-1",
    sourceInvoiceVersion: 1,
    sourceHash: "hash-1",
    decisionSource: "category",
    decisionPolicyUsed: "category_create_review",
    supplierName: "Makro",
    invoiceNumber: "FT 1",
    invoiceDate: "2026-09-20",
    ...overrides,
  });
  repository.seedReview(review);
  return review;
}

describe("GetStockPurchaseReviewStatusForInvoiceUseCase", () => {
  it("devolve null quando a fatura não tem nenhuma revisão associada", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const useCase = new GetStockPurchaseReviewStatusForInvoiceUseCase(repository);

    const result = await useCase.execute({ organizationId: ORG, invoiceId: "inv-sem-revisao" });
    expect(result).toBeNull();
  });

  it("devolve reviewId e status quando existe uma revisão", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const review = seedReview(repository);
    const useCase = new GetStockPurchaseReviewStatusForInvoiceUseCase(repository);

    const result = await useCase.execute({ organizationId: ORG, invoiceId: "inv-1" });
    expect(result).toEqual({ reviewId: review.id, status: "pending" });
  });
});

describe("DeleteDraftStockPurchaseReviewUseCase", () => {
  it("é um no-op (deleted: false) quando a fatura não tem nenhuma revisão associada", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const auditLog = new FakeStockReviewAuditLog();
    const useCase = new DeleteDraftStockPurchaseReviewUseCase(repository, auditLog);

    const result = await useCase.execute({ organizationId: ORG, invoiceId: "inv-sem-revisao", actor: "user@fonsat.pt" });
    expect(result).toEqual({ deleted: false });
    expect(auditLog.entries).toHaveLength(0);
  });

  it("apaga fisicamente (hard delete) uma revisão ainda não aplicada e regista auditoria", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const auditLog = new FakeStockReviewAuditLog();
    const review = seedReview(repository, { decisionSource: "unresolved", decisionPolicyUsed: "no_signal" });
    const useCase = new DeleteDraftStockPurchaseReviewUseCase(repository, auditLog);

    const result = await useCase.execute({ organizationId: ORG, invoiceId: "inv-1", actor: "user@fonsat.pt" });

    expect(result).toEqual({ deleted: true });
    expect(await repository.findById(ORG, review.id)).toBeNull();
    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0]?.action).toBe("draft_deleted_due_to_invoice_edit");
  });

  it("lança ReviewAlreadyAppliedError e nunca apaga quando a revisão já foi aplicada", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const auditLog = new FakeStockReviewAuditLog();
    // Simula uma revisão applied diretamente via reconstitute (apply() normal exige status "ready" primeiro).
    const applied = StockPurchaseReview.reconstitute({
      id: "rev-applied",
      organizationId: ORG,
      invoiceId: "inv-1",
      status: "applied",
      version: 3,
      sourceInvoiceVersion: 1,
      sourceHash: "hash-1",
      decisionSource: "category",
      decisionCategoryId: null,
      decisionSupplierId: null,
      decisionPolicyUsed: "category_create_review",
      decisionActor: null,
      decisionOverrideReason: null,
      decisionAt: new Date(),
      supplierName: "Makro",
      invoiceNumber: "FT 1",
      invoiceDate: "2026-09-20",
      locationId: null,
      appliedAt: new Date(),
      cancelledAt: null,
      cancellationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    repository.seedReview(applied);
    const useCase = new DeleteDraftStockPurchaseReviewUseCase(repository, auditLog);

    await expect(
      useCase.execute({ organizationId: ORG, invoiceId: "inv-1", actor: "user@fonsat.pt" }),
    ).rejects.toThrow(ReviewAlreadyAppliedError);

    expect(await repository.findById(ORG, "rev-applied")).not.toBeNull();
    expect(auditLog.entries).toHaveLength(0);
  });
});
