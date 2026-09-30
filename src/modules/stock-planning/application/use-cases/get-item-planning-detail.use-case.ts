import { StockItemPlanningNotFoundError, NoLatestForecastRunError } from "../../domain/errors.js";
import type { GetItemPlanningDetailCommand, GetItemPlanningDetailPort, PlanningItemDetailDTO } from "../../domain/ports/in/stock-planning.ports.js";
import type { ForecastRunRepositoryPort } from "../../domain/ports/out/forecast-run-repository.port.js";
import type { PendingPurchaseReviewReadPort } from "../../domain/ports/out/pending-purchase-review-read.port.js";
import type { PlanningAlertRepositoryPort } from "../../domain/ports/out/planning-alert-repository.port.js";
import type { RecipeConsumptionPort } from "../../domain/ports/out/recipe-consumption.port.js";
import type { StockCountSignalReadPort } from "../../domain/ports/out/stock-count-signal-read.port.js";
import type { StockItemPlanningReadPort } from "../../domain/ports/out/stock-item-planning-read.port.js";
import type { StockQuantityReadPort } from "../../domain/ports/out/stock-quantity-read.port.js";
import { simulateImpact } from "../../domain/services/impact-simulation.service.js";
import { yesterdayISO } from "./date-utils.js";
import { buildItemProjectionContext, buildRow } from "./shared.js";

/**
 * Detalhe de um item (5 abas do mockup) — "produtos afetados" é
 * recalculado em leitura chamando `RecipeConsumptionPort.convert()` outra
 * vez sobre os `forecast_demand_points` já gravados do run (não persistimos
 * as contribuições por fonte, só o agregado — ver README).
 */
export class GetItemPlanningDetailUseCase implements GetItemPlanningDetailPort {
  constructor(
    private readonly stockItemPlanningRead: StockItemPlanningReadPort,
    private readonly stockQuantityRead: StockQuantityReadPort,
    private readonly forecastRunRepo: ForecastRunRepositoryPort,
    private readonly planningAlertRepo: PlanningAlertRepositoryPort,
    private readonly pendingPurchaseReviewRead: PendingPurchaseReviewReadPort,
    private readonly stockCountSignalRead: StockCountSignalReadPort,
    private readonly recipeConsumption: RecipeConsumptionPort,
  ) {}

  async execute(command: GetItemPlanningDetailCommand): Promise<PlanningItemDetailDTO> {
    const item = await this.stockItemPlanningRead.findById(command.organizationId, command.stockItemId);
    if (!item) throw new StockItemPlanningNotFoundError(command.stockItemId);

    const quantities = await this.stockQuantityRead.getQuantities(command.organizationId, [item.id]);
    const snapshot = quantities.get(item.id) ?? { stockItemId: item.id, currentQuantity: 0, lastPurchaseUnitCostWithoutVat: null };

    const latestRun = await this.forecastRunRepo.findLatestRun(command.organizationId, command.locationId);
    if (!latestRun) throw new NoLatestForecastRunError(command.locationId);

    const recommendations = await this.forecastRunRepo.findRecommendations(command.organizationId, latestRun.id);
    const recommendation = recommendations.find((r) => r.stockItemId === item.id) ?? null;

    const ctx = await buildItemProjectionContext({
      organizationId: command.organizationId,
      runId: latestRun.id,
      item,
      snapshot,
      forecastRunRepo: this.forecastRunRepo,
      planningAlertRepo: this.planningAlertRepo,
      pendingPurchaseReviewRead: this.pendingPurchaseReviewRead,
      stockCountSignalRead: this.stockCountSignalRead,
      recommendation,
      hasIncompleteMapping: false,
      today: yesterdayISO(),
    });

    const demandPoints = await this.forecastRunRepo.findDemandPointsForRun(command.organizationId, latestRun.id);
    const conversion = await this.recipeConsumption.convert(
      command.organizationId,
      demandPoints.map((d) => ({
        demandSourceType: d.demandSourceType,
        demandSourceRef: d.demandSourceRef,
        date: d.forecastDate,
        predictedQuantity: d.predictedQuantity,
      })),
    );
    const affectedProducts = simulateImpact(item.id, conversion.contributions);

    const row = buildRow(ctx);
    return {
      ...row,
      projection: ctx.projection.points,
      // Consumo previsto do próprio item (não a venda que o originou) —
      // "actualQuantity" fica `null` nesta ronda: exigiria repetir a
      // conversão sobre o histórico REAL de vendas (não só previsões), o
      // que é possível mas não foi feito neste round por custo — ver README.
      demandPoints: ctx.projection.points.map((p) => ({ date: p.date, predictedQuantity: p.expectedConsumption, actualQuantity: null })),
      affectedProducts,
      quality: ctx.quality,
      recommendation: recommendation
        ? {
            recommendationId: recommendation.id,
            stockNow: recommendation.stockNow,
            targetStock: recommendation.targetStock,
            safetyStock: recommendation.safetyStock,
            projectedAtWindow: recommendation.projectedAtWindow,
            suggestedBaseQty: recommendation.suggestedBaseQty,
            suggestedPurchaseQty: recommendation.suggestedPurchaseQty,
            purchaseUnit: recommendation.purchaseUnit,
            estimatedCost: recommendation.estimatedCost,
            nextDeliveryDate: (recommendation.explanationData.nextDeliveryDate as string | null) ?? null,
            followingDeliveryDate: (recommendation.explanationData.followingDeliveryDate as string | null) ?? null,
            explanationData: recommendation.explanationData,
          }
        : null,
    };
  }
}
