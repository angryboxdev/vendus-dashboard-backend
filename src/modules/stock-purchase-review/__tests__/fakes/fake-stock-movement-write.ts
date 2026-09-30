import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  ConfirmReviewResult,
  CreateReviewFromInvoiceInput,
  CreateReviewFromInvoiceResult,
  StockMovementWritePort,
} from "../../domain/ports/out/stock-movement-write.port.js";
import type { FakeStockPurchaseReviewRepository } from "./fake-stock-purchase-review-repository.js";

/**
 * Simula `ON CONFLICT (invoice_id) DO NOTHING` — chamar duas vezes para a
 * mesma fatura nunca cria uma segunda revisão. Quando ligada a um
 * `FakeStockPurchaseReviewRepository` (opcional), `confirmReview` também
 * muta essa revisão para `applied` — espelha o efeito real da RPC
 * `fn_stock_review_confirm` na base de dados, que o use case depois relê
 * via `repository.findById`.
 */
export class FakeStockMovementWrite implements StockMovementWritePort {
  calls: CreateReviewFromInvoiceInput[] = [];
  private reviewIdByInvoiceId = new Map<string, string>();
  confirmResult: ConfirmReviewResult | null = null;
  confirmCalls: Array<{ reviewId: string; expectedVersion: number; confirmedBy: string; effectiveDate: string; fallbackLocationId: string | null }> = [];

  constructor(private readonly repository?: FakeStockPurchaseReviewRepository) {}

  async createReviewFromInvoice(_organizationId: OrganizationId, input: CreateReviewFromInvoiceInput): Promise<CreateReviewFromInvoiceResult> {
    this.calls.push(input);
    const existing = this.reviewIdByInvoiceId.get(input.invoiceId);
    if (existing) return { reviewId: existing, createdNow: false };
    const reviewId = randomUUID();
    this.reviewIdByInvoiceId.set(input.invoiceId, reviewId);
    return { reviewId, createdNow: true };
  }

  async confirmReview(
    organizationId: OrganizationId,
    reviewId: string,
    expectedVersion: number,
    confirmedBy: string,
    effectiveDate: string,
    fallbackLocationId: string | null,
  ): Promise<ConfirmReviewResult> {
    this.confirmCalls.push({ reviewId, expectedVersion, confirmedBy, effectiveDate, fallbackLocationId });
    if (this.confirmResult) return this.confirmResult;

    if (this.repository) {
      const review = this.repository.reviews.get(reviewId);
      if (review && review.status === "applied") {
        return { reviewId, status: "applied", version: review.version, movementIds: ["mov-existing"], alreadyApplied: true };
      }
      if (review) {
        const applied = review.apply();
        await this.repository.save(organizationId, applied, expectedVersion);
        return { reviewId, status: "applied", version: applied.version, movementIds: [randomUUID()], alreadyApplied: false };
      }
    }

    return {
      reviewId,
      status: "applied",
      version: expectedVersion + 1,
      movementIds: [randomUUID()],
      alreadyApplied: false,
    };
  }
}
