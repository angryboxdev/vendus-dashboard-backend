import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { PendingPurchaseReviewReadPort } from "../../domain/ports/out/pending-purchase-review-read.port.js";

export class FakePendingPurchaseReviewRead implements PendingPurchaseReviewReadPort {
  itemsWithPendingReview = new Set<string>();

  async hasPendingReviewForItem(_organizationId: OrganizationId, stockItemId: string): Promise<boolean> {
    return this.itemsWithPendingReview.has(stockItemId);
  }
}
