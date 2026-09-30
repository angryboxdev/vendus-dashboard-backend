import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type {
  ConfirmReviewResult,
  CreateReviewFromInvoiceInput,
  CreateReviewFromInvoiceResult,
  StockMovementWritePort,
} from "../../domain/ports/out/stock-movement-write.port.js";
import {
  StaleReviewVersionError,
  ReviewNotReadyError,
  InactiveStockItemReferencedError,
  LocationRequiredError,
  StockPurchaseReviewNotFoundError,
} from "../../domain/errors.js";

export class SupabaseStockMovementWriteAdapter implements StockMovementWritePort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async createReviewFromInvoice(organizationId: OrganizationId, input: CreateReviewFromInvoiceInput): Promise<CreateReviewFromInvoiceResult> {
    const review = {
      invoice_id: input.invoiceId,
      source_invoice_version: input.sourceInvoiceVersion,
      source_hash: input.sourceHash,
      decision_source: input.decisionSource,
      decision_category_id: input.decisionCategoryId,
      decision_supplier_id: input.decisionSupplierId,
      decision_policy_used: input.decisionPolicyUsed,
      decision_actor: input.decisionActor,
      decision_override_reason: input.decisionOverrideReason,
      supplier_name: input.supplierName,
      invoice_number: input.invoiceNumber,
      invoice_date: input.invoiceDate,
    };
    const lines = input.lines.map((l) => ({
      invoice_line_id: l.invoiceLineId,
      description: l.description,
      purchase_quantity: l.purchaseQuantity,
      purchase_unit: l.purchaseUnit,
      unit_cost_without_vat: l.unitCostWithoutVat,
      total_with_vat: l.totalWithVat,
    }));
    const { data, error } = await this.scopedQuery(organizationId).createStockPurchaseReviewFromInvoice(review, lines);
    if (error) throw new Error(error.message);
    const r = (Array.isArray(data) ? data[0] : data) as unknown as { review_id: string; created_now: boolean };
    return { reviewId: r.review_id, createdNow: Boolean(r.created_now) };
  }

  async confirmReview(
    organizationId: OrganizationId,
    reviewId: string,
    expectedVersion: number,
    confirmedBy: string,
    effectiveDate: string,
    fallbackLocationId: string | null,
  ): Promise<ConfirmReviewResult> {
    const { data, error } = await this.scopedQuery(organizationId).confirmStockPurchaseReview(
      reviewId,
      expectedVersion,
      confirmedBy,
      effectiveDate,
      fallbackLocationId,
    );
    if (error) {
      if (error.message.includes("stale_version")) {
        const { data: current } = await this.scopedQuery(organizationId)
          .table("stock_purchase_reviews")
          .select("version")
          .eq("id", reviewId)
          .maybeSingle();
        const currentVersion = (current as unknown as { version: number } | null)?.version ?? expectedVersion;
        throw new StaleReviewVersionError(currentVersion);
      }
      if (error.message.includes("not_ready")) throw new ReviewNotReadyError("há linhas por resolver ou a revisão não está Pronta");
      if (error.message.includes("inactive_item")) throw new InactiveStockItemReferencedError("(ver linhas da revisão)");
      if (error.message.includes("location_required")) throw new LocationRequiredError();
      if (error.message.includes("review_not_found")) throw new StockPurchaseReviewNotFoundError(reviewId);
      throw new Error(error.message);
    }
    const r = (Array.isArray(data) ? data[0] : data) as unknown as {
      status: string;
      version: number;
      movement_ids: string[];
      already_applied: boolean;
    };
    return {
      reviewId,
      status: r.status,
      version: r.version,
      movementIds: r.movement_ids ?? [],
      alreadyApplied: Boolean(r.already_applied),
    };
  }
}
