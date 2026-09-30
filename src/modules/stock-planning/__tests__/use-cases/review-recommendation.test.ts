import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ForecastRun } from "../../domain/entities/forecast-run.js";
import { RecommendationNotFoundError } from "../../domain/errors.js";
import { ReviewRecommendationUseCase } from "../../application/use-cases/review-recommendation.use-case.js";
import { FakeForecastRunRepository } from "../fakes/fake-forecast-run-repository.js";
import { FakeRecommendationReviewRepository } from "../fakes/fake-recommendation-review-repository.js";

const ORG = mintOrganizationId("org-test");
const LOCATION = "loc-1";

describe("ReviewRecommendationUseCase", () => {
  it("regista a revisão como auditoria — nunca assume que a compra foi efetuada", async () => {
    const forecastRunRepo = new FakeForecastRunRepository();
    const run = ForecastRun.start({
      organizationId: ORG,
      locationId: LOCATION,
      dataCutoffAt: new Date(),
      horizonStart: "2026-09-30",
      horizonEnd: "2026-10-13",
      modelName: "m",
      modelVersion: "1",
    });
    await forecastRunRepo.insertRun(ORG, run);
    await forecastRunRepo.saveRunResult({
      organizationId: ORG,
      run: run.complete(null),
      demandPoints: [],
      stockRequirements: [],
      recommendations: [
        {
          stockItemId: "tomate",
          supplierId: null,
          stockNow: 3,
          projectedAtWindow: null,
          targetStock: 10,
          safetyStock: 2,
          suggestedBaseQty: 7,
          suggestedPurchaseQty: null,
          purchaseUnit: null,
          estimatedCost: null,
          confidence: "media",
          explanationData: {},
        },
      ],
    });
    const [rec] = await forecastRunRepo.findRecommendations(ORG, run.id);

    const recommendationReviewRepo = new FakeRecommendationReviewRepository();
    const useCase = new ReviewRecommendationUseCase(forecastRunRepo, recommendationReviewRepo);
    await useCase.execute({ organizationId: ORG, recommendationId: rec!.id, reviewedQty: 5, reason: "fornecedor tinha menos disponível", actor: "manager@fonsat.pt" });

    expect(recommendationReviewRepo.reviews).toHaveLength(1);
    expect(recommendationReviewRepo.reviews[0]?.toProps().reviewedQty).toBe(5);
    expect(recommendationReviewRepo.reviews[0]?.toProps().suggestedQty).toBe(7);
  });

  it("recomendação inexistente lança erro", async () => {
    const forecastRunRepo = new FakeForecastRunRepository();
    const recommendationReviewRepo = new FakeRecommendationReviewRepository();
    const useCase = new ReviewRecommendationUseCase(forecastRunRepo, recommendationReviewRepo);
    await expect(useCase.execute({ organizationId: ORG, recommendationId: "missing", reviewedQty: 1, actor: "a" })).rejects.toThrow(RecommendationNotFoundError);
  });
});
