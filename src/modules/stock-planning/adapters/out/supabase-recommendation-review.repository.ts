import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { RecommendationReview } from "../../domain/entities/recommendation-review.js";
import type { RecommendationReviewRepositoryPort } from "../../domain/ports/out/recommendation-review-repository.port.js";

interface Row {
  id: string;
  recommendation_id: string;
  suggested_qty: number;
  reviewed_qty: number;
  reviewed_by: string;
  reviewed_at: string;
  reason: string | null;
}

function toEntity(organizationId: OrganizationId, row: Row): RecommendationReview {
  return RecommendationReview.reconstitute({
    id: row.id,
    organizationId,
    recommendationId: row.recommendation_id,
    suggestedQty: Number(row.suggested_qty),
    reviewedQty: Number(row.reviewed_qty),
    reviewedBy: row.reviewed_by,
    reviewedAt: new Date(row.reviewed_at),
    reason: row.reason,
  });
}

/** Auditoria de revisão manual (secção 60) — nunca um estado de pedido, `insert`-only. */
export class SupabaseRecommendationReviewRepository implements RecommendationReviewRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async insert(organizationId: OrganizationId, review: RecommendationReview): Promise<void> {
    const p = review.toProps();
    const { error } = await this.scopedQuery(organizationId).table("recommendation_reviews").insert({
      id: p.id,
      recommendation_id: p.recommendationId,
      suggested_qty: p.suggestedQty,
      reviewed_qty: p.reviewedQty,
      reviewed_by: p.reviewedBy,
      reviewed_at: p.reviewedAt.toISOString(),
      reason: p.reason,
    });
    if (error) throw new Error(error.message);
  }

  async findByRecommendationId(organizationId: OrganizationId, recommendationId: string): Promise<RecommendationReview[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("recommendation_reviews")
      .select("*")
      .eq("recommendation_id", recommendationId)
      .order("reviewed_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map((r) => toEntity(organizationId, r));
  }
}
