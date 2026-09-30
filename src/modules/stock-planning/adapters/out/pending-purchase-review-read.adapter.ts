import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { PendingPurchaseReviewReadPort } from "../../domain/ports/out/pending-purchase-review-read.port.js";

/** Qualquer estado antes de `applied`/`cancelled` conta como "pendente" (ainda pode alterar o item/quantidade resolvidos). */
const PENDING_STATUSES = ["pending", "in_review", "partial", "ready"];

/** Lê `stock_purchase_reviews`/`stock_review_lines` diretamente por `ScopedQuery` — ver o port para o porquê. */
export class PendingPurchaseReviewReadAdapter implements PendingPurchaseReviewReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async hasPendingReviewForItem(organizationId: OrganizationId, stockItemId: string): Promise<boolean> {
    const { data: reviewRows, error: reviewError } = await this.scopedQuery(organizationId)
      .table("stock_purchase_reviews")
      .select("id")
      .in("status", PENDING_STATUSES);
    if (reviewError) throw new Error(reviewError.message);
    const reviewIds = ((reviewRows ?? []) as unknown as { id: string }[]).map((r) => r.id);
    if (reviewIds.length === 0) return false;

    const { data: lineRows, error: lineError } = await this.scopedQuery(organizationId)
      .table("stock_review_lines")
      .select("id")
      .eq("stock_item_id", stockItemId)
      .in("review_id", reviewIds)
      .limit(1);
    if (lineError) throw new Error(lineError.message);
    return ((lineRows ?? []) as unknown[]).length > 0;
  }
}
