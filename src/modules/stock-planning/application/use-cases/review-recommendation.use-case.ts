import { RecommendationNotFoundError, ReviewedQuantityRequiredError } from "../../domain/errors.js";
import { RecommendationReview } from "../../domain/entities/recommendation-review.js";
import type { ReviewRecommendationCommand, ReviewRecommendationPort } from "../../domain/ports/in/stock-planning.ports.js";
import type { ForecastRunRepositoryPort } from "../../domain/ports/out/forecast-run-repository.port.js";
import type { RecommendationReviewRepositoryPort } from "../../domain/ports/out/recommendation-review-repository.port.js";

/** Auditoria de revisão manual (secção 60) — `reviewedQty` nunca é assumida como compra efetuada. */
export class ReviewRecommendationUseCase implements ReviewRecommendationPort {
  constructor(
    private readonly forecastRunRepo: ForecastRunRepositoryPort,
    private readonly recommendationReviewRepo: RecommendationReviewRepositoryPort,
  ) {}

  async execute(command: ReviewRecommendationCommand): Promise<void> {
    if (!Number.isFinite(command.reviewedQty) || command.reviewedQty < 0) throw new ReviewedQuantityRequiredError();

    // findRecommendationById percorre todos os runs indiretamente via id — usa qualquer organização válida.
    const recommendation = await this.forecastRunRepo.findRecommendationById(command.organizationId, command.recommendationId);
    if (!recommendation) throw new RecommendationNotFoundError(command.recommendationId);

    const review = RecommendationReview.create({
      organizationId: command.organizationId,
      recommendationId: command.recommendationId,
      suggestedQty: recommendation.suggestedPurchaseQty ?? recommendation.suggestedBaseQty,
      reviewedQty: command.reviewedQty,
      reviewedBy: command.actor,
      reason: command.reason ?? null,
    });
    await this.recommendationReviewRepo.insert(command.organizationId, review);
  }
}
