import { NoLatestForecastRunError, PlanningAlertNotFoundError } from "../../domain/errors.js";
import type { GetPlanningAlertDetailCommand, GetPlanningAlertDetailPort, PlanningAlertDetailDTO } from "../../domain/ports/in/stock-planning.ports.js";
import type { ForecastRunRepositoryPort } from "../../domain/ports/out/forecast-run-repository.port.js";
import type { PendingPurchaseReviewReadPort } from "../../domain/ports/out/pending-purchase-review-read.port.js";
import type { PlanningAlertRepositoryPort } from "../../domain/ports/out/planning-alert-repository.port.js";
import type { RecipeConsumptionPort } from "../../domain/ports/out/recipe-consumption.port.js";
import type { StockCountSignalReadPort } from "../../domain/ports/out/stock-count-signal-read.port.js";
import type { StockItemPlanningReadPort } from "../../domain/ports/out/stock-item-planning-read.port.js";
import type { StockQuantityReadPort } from "../../domain/ports/out/stock-quantity-read.port.js";
import { simulateImpact } from "../../domain/services/impact-simulation.service.js";
import { yesterdayISO } from "./date-utils.js";
import { buildItemProjectionContext } from "./shared.js";
import { explainAlert, toAlertRowDTO } from "./shared-alert.js";

export class GetPlanningAlertDetailUseCase implements GetPlanningAlertDetailPort {
  constructor(
    private readonly planningAlertRepo: PlanningAlertRepositoryPort,
    private readonly stockItemPlanningRead: StockItemPlanningReadPort,
    private readonly stockQuantityRead: StockQuantityReadPort,
    private readonly forecastRunRepo: ForecastRunRepositoryPort,
    private readonly pendingPurchaseReviewRead: PendingPurchaseReviewReadPort,
    private readonly stockCountSignalRead: StockCountSignalReadPort,
    private readonly recipeConsumption: RecipeConsumptionPort,
  ) {}

  async execute(command: GetPlanningAlertDetailCommand): Promise<PlanningAlertDetailDTO> {
    const alert = await this.planningAlertRepo.findById(command.organizationId, command.alertId);
    if (!alert) throw new PlanningAlertNotFoundError(command.alertId);
    const p = alert.toProps();

    const item = await this.stockItemPlanningRead.findById(command.organizationId, p.itemId);
    const itemName = item?.name ?? p.itemId;

    const latestRun = await this.forecastRunRepo.findLatestRun(command.organizationId, p.locationId);
    if (!latestRun || !item) throw new NoLatestForecastRunError(p.locationId);

    const quantities = await this.stockQuantityRead.getQuantities(command.organizationId, [item.id]);
    const snapshot = quantities.get(p.itemId) ?? { stockItemId: p.itemId, currentQuantity: 0, lastPurchaseUnitCostWithoutVat: null };

    const ctx = await buildItemProjectionContext({
      organizationId: command.organizationId,
      runId: latestRun.id,
      item,
      snapshot,
      forecastRunRepo: this.forecastRunRepo,
      planningAlertRepo: this.planningAlertRepo,
      pendingPurchaseReviewRead: this.pendingPurchaseReviewRead,
      stockCountSignalRead: this.stockCountSignalRead,
      recommendation: null,
      hasIncompleteMapping: false,
      today: yesterdayISO(),
    });

    const demandPoints = await this.forecastRunRepo.findDemandPointsForRun(command.organizationId, latestRun.id);
    const conversion = await this.recipeConsumption.convert(
      command.organizationId,
      demandPoints.map((d) => ({ demandSourceType: d.demandSourceType, demandSourceRef: d.demandSourceRef, date: d.forecastDate, predictedQuantity: d.predictedQuantity })),
    );

    return {
      ...toAlertRowDTO(alert, itemName),
      contextSnapshot: p.contextSnapshot,
      projection: ctx.projection.points,
      affectedProducts: simulateImpact(p.itemId, conversion.contributions),
      quality: ctx.quality,
      explanation: explainAlert(alert),
    };
  }
}
