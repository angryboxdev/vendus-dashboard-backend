import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { StockPurchaseReview } from "../../entities/stock-purchase-review.js";
import type { StockReviewLine } from "../../entities/stock-review-line.js";

export interface StockPurchaseReviewFilter {
  status?: string;
  supplierId?: string;
  from?: string;
  to?: string;
  search?: string;
}

export interface StockPurchaseReviewRepositoryPort {
  findById(organizationId: OrganizationId, id: string): Promise<StockPurchaseReview | null>;
  findByInvoiceId(organizationId: OrganizationId, invoiceId: string): Promise<StockPurchaseReview | null>;
  findAll(organizationId: OrganizationId, filter?: StockPurchaseReviewFilter): Promise<StockPurchaseReview[]>;
  /** `expectedVersion` — lock otimista; 0 linhas afetadas ⇒ o adapter lança `StaleReviewVersionError`. */
  save(organizationId: OrganizationId, review: StockPurchaseReview, expectedVersion?: number): Promise<void>;
  findLinesByReviewId(organizationId: OrganizationId, reviewId: string): Promise<StockReviewLine[]>;
  saveLines(organizationId: OrganizationId, lines: StockReviewLine[]): Promise<void>;
  saveLine(organizationId: OrganizationId, line: StockReviewLine): Promise<void>;
}
