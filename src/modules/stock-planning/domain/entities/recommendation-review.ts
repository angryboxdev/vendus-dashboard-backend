interface RecommendationReviewProps {
  id: string;
  organizationId: string;
  recommendationId: string;
  suggestedQty: number;
  reviewedQty: number;
  reviewedBy: string;
  reviewedAt: Date;
  reason: string | null;
}

export interface CreateRecommendationReviewProps {
  organizationId: string;
  recommendationId: string;
  suggestedQty: number;
  reviewedQty: number;
  reviewedBy: string;
  reason?: string | null;
}

/**
 * Registo auditável de revisão manual da quantidade sugerida (secção 60).
 * `reviewedQty` é só um registo de auditoria — nunca assume que a compra
 * foi de facto efetuada; stock só muda via `stock-purchase-review`/
 * `stock-count`, nunca aqui (secção 62).
 */
export class RecommendationReview {
  private constructor(private readonly props: RecommendationReviewProps) {}

  static create(props: CreateRecommendationReviewProps): RecommendationReview {
    return new RecommendationReview({
      id: crypto.randomUUID(),
      organizationId: props.organizationId,
      recommendationId: props.recommendationId,
      suggestedQty: props.suggestedQty,
      reviewedQty: props.reviewedQty,
      reviewedBy: props.reviewedBy,
      reviewedAt: new Date(),
      reason: props.reason ?? null,
    });
  }

  static reconstitute(props: RecommendationReviewProps): RecommendationReview {
    return new RecommendationReview(props);
  }

  get id(): string {
    return this.props.id;
  }

  toProps(): RecommendationReviewProps {
    return { ...this.props };
  }
}
