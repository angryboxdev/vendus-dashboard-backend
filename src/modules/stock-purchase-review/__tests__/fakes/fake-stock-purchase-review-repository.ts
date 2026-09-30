import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { StockPurchaseReview } from "../../domain/entities/stock-purchase-review.js";
import type { StockReviewLine } from "../../domain/entities/stock-review-line.js";
import { StaleReviewVersionError } from "../../domain/errors.js";
import type {
  StockPurchaseReviewFilter,
  StockPurchaseReviewRepositoryPort,
} from "../../domain/ports/out/stock-purchase-review-repository.port.js";

export class FakeStockPurchaseReviewRepository implements StockPurchaseReviewRepositoryPort {
  reviews = new Map<string, StockPurchaseReview>();
  lines = new Map<string, StockReviewLine>();

  seedReview(review: StockPurchaseReview): void {
    this.reviews.set(review.id, review);
  }

  seedLines(lines: StockReviewLine[]): void {
    for (const line of lines) this.lines.set(line.id, line);
  }

  async findById(_organizationId: OrganizationId, id: string): Promise<StockPurchaseReview | null> {
    return this.reviews.get(id) ?? null;
  }

  async findByInvoiceId(_organizationId: OrganizationId, invoiceId: string): Promise<StockPurchaseReview | null> {
    for (const r of this.reviews.values()) {
      if (r.invoiceId === invoiceId) return r;
    }
    return null;
  }

  async findAll(_organizationId: OrganizationId, filter?: StockPurchaseReviewFilter): Promise<StockPurchaseReview[]> {
    return [...this.reviews.values()].filter((r) => {
      if (filter?.status && r.status !== filter.status) return false;
      return true;
    });
  }

  async save(_organizationId: OrganizationId, review: StockPurchaseReview, expectedVersion?: number): Promise<void> {
    const existing = this.reviews.get(review.id);
    if (expectedVersion !== undefined && existing && existing.version !== expectedVersion) {
      throw new StaleReviewVersionError(existing.version);
    }
    this.reviews.set(review.id, review);
  }

  async findLinesByReviewId(_organizationId: OrganizationId, reviewId: string): Promise<StockReviewLine[]> {
    return [...this.lines.values()].filter((l) => l.reviewId === reviewId);
  }

  async saveLines(_organizationId: OrganizationId, lines: StockReviewLine[]): Promise<void> {
    for (const line of lines) this.lines.set(line.id, line);
  }

  async saveLine(_organizationId: OrganizationId, line: StockReviewLine): Promise<void> {
    this.lines.set(line.id, line);
  }
}
