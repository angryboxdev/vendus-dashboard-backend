import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { RecommendationReview } from "../../entities/recommendation-review.js";

/** Auditoria de revisão manual (secção 60) — nunca um estado de pedido, nunca assume compra efetuada. */
export interface RecommendationReviewRepositoryPort {
  insert(organizationId: OrganizationId, review: RecommendationReview): Promise<void>;
  findByRecommendationId(organizationId: OrganizationId, recommendationId: string): Promise<RecommendationReview[]>;
}
