import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { RecommendationReview } from "../../domain/entities/recommendation-review.js";
import type { RecommendationReviewRepositoryPort } from "../../domain/ports/out/recommendation-review-repository.port.js";

export class FakeRecommendationReviewRepository implements RecommendationReviewRepositoryPort {
  reviews: RecommendationReview[] = [];

  async insert(_organizationId: OrganizationId, review: RecommendationReview): Promise<void> {
    this.reviews.push(review);
  }

  async findByRecommendationId(_organizationId: OrganizationId, recommendationId: string): Promise<RecommendationReview[]> {
    return this.reviews.filter((r) => r.toProps().recommendationId === recommendationId);
  }
}
