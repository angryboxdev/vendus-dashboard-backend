import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { ForecastRun } from "../../domain/entities/forecast-run.js";
import { buildAlertFingerprint, PlanningAlert, type PlanningAlertSeverity, type PlanningAlertType } from "../../domain/entities/planning-alert.js";
import type {
  RunDailyForecastCommand,
  RunDailyForecastLocationResultDTO,
  RunDailyForecastPort,
  RunDailyForecastResultDTO,
} from "../../domain/ports/in/stock-planning.ports.js";
import type { DemandActualsRepositoryPort } from "../../domain/ports/out/demand-actuals-repository.port.js";
import type { ForecastRunRepositoryPort, ForecastStockRequirementRow, ReplenishmentRecommendationRow } from "../../domain/ports/out/forecast-run-repository.port.js";
import type { LearnedMappingReadPort } from "../../domain/ports/out/learned-mapping-read.port.js";
import type { LocationReadPort } from "../../domain/ports/out/location-read.port.js";
import type { PendingPurchaseReviewReadPort } from "../../domain/ports/out/pending-purchase-review-read.port.js";
import type { PlanningAlertRepositoryPort } from "../../domain/ports/out/planning-alert-repository.port.js";
import type { DemandPredictionInput, RecipeConsumptionPort } from "../../domain/ports/out/recipe-consumption.port.js";
import type { StockCountSignalReadPort } from "../../domain/ports/out/stock-count-signal-read.port.js";
import type { StockItemPlanningReadPort } from "../../domain/ports/out/stock-item-planning-read.port.js";
import type { StockQuantityReadPort } from "../../domain/ports/out/stock-quantity-read.port.js";
import type { SupplierDeliveryScheduleReadPort } from "../../domain/ports/out/supplier-delivery-schedule-read.port.js";
import type { VendusSalesReadPort } from "../../domain/ports/out/vendus-sales-read.port.js";
import type { DailyActual, ForecastModel } from "../../domain/services/baseline-forecast.model.js";
import { computeBacktest, type BacktestPoint } from "../../domain/services/backtest.service.js";
import { computeConfidence, type ConfidenceLevel } from "../../domain/services/confidence.service.js";
import { detectPriceAnomaly } from "../../domain/services/price-anomaly.service.js";
import { computeNextDeliveryWindows, computeReplenishment } from "../../domain/services/replenishment.service.js";
import { computeSafetyStock } from "../../domain/services/safety-stock.service.js";
import { computeStockProjection, type ForecastRequirementDay } from "../../domain/services/stock-projection.service.js";
import { addDaysISO, diffDaysISO, yesterdayISO } from "./date-utils.js";

const DEFAULT_HORIZON_DAYS = 14;
const HISTORY_WINDOW_DAYS = 90;
const HISTORY_WINDOW_DAYS_MIN_FOR_BACKTEST = 14;
const BACKTEST_HOLDOUT_DAYS = 7;
const DEFAULT_LEAD_TIME_DAYS = 7;
const PRICE_ANOMALY_THRESHOLD_PERCENT = 0.15;

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { alta: 2, media: 1, baixa: 0 };

/**
 * Pipeline diário completo (9 passos, ver README/plano): incrementa o
 * histórico de vendas, prevê por fonte de procura, converte para consumo
 * de ingrediente (reaproveitando o adapter legacy), projeta stock,
 * calcula stock de segurança + reposição, simula impacto, combina
 * confiança, faz upsert de alertas por fingerprint e grava o run.
 */
export class RunDailyForecastUseCase implements RunDailyForecastPort {
  constructor(
    private readonly locationRead: LocationReadPort,
    private readonly demandActualsRepo: DemandActualsRepositoryPort,
    private readonly vendusSalesRead: VendusSalesReadPort,
    private readonly recipeConsumption: RecipeConsumptionPort,
    private readonly stockQuantityRead: StockQuantityReadPort,
    private readonly stockItemPlanningRead: StockItemPlanningReadPort,
    private readonly forecastRunRepo: ForecastRunRepositoryPort,
    private readonly planningAlertRepo: PlanningAlertRepositoryPort,
    private readonly supplierDeliveryScheduleRead: SupplierDeliveryScheduleReadPort,
    private readonly learnedMappingRead: LearnedMappingReadPort,
    private readonly pendingPurchaseReviewRead: PendingPurchaseReviewReadPort,
    private readonly stockCountSignalRead: StockCountSignalReadPort,
    private readonly forecastModel: ForecastModel,
  ) {}

  async execute(command: RunDailyForecastCommand): Promise<RunDailyForecastResultDTO> {
    const locations = command.locationId
      ? [{ id: command.locationId, name: "", isActive: true }]
      : await this.locationRead.listActive(command.organizationId);

    const dataCutoffDate = command.dataCutoffDate ?? yesterdayISO();
    const horizonDays = command.horizonDays ?? DEFAULT_HORIZON_DAYS;

    const results: RunDailyForecastLocationResultDTO[] = [];
    for (const location of locations) {
      results.push(await this.runForLocation(command.organizationId, location.id, dataCutoffDate, horizonDays));
    }
    return { results };
  }

  private async runForLocation(
    organizationId: OrganizationId,
    locationId: string,
    dataCutoffDate: string,
    horizonDays: number,
  ): Promise<RunDailyForecastLocationResultDTO> {
    const horizonStart = addDaysISO(dataCutoffDate, 1);
    const horizonEnd = addDaysISO(dataCutoffDate, horizonDays);
    const historyStart = addDaysISO(dataCutoffDate, -HISTORY_WINDOW_DAYS);

    let run = ForecastRun.start({
      organizationId,
      locationId,
      dataCutoffAt: new Date(`${dataCutoffDate}T23:59:59.000Z`),
      horizonStart,
      horizonEnd,
      modelName: this.forecastModel.name,
      modelVersion: this.forecastModel.version,
    });
    await this.forecastRunRepo.insertRun(organizationId, run);

    try {
      // 1. Incrementa o histórico de vendas com o dia anterior.
      const dailyRows = await this.vendusSalesRead.fetchDailyActuals(organizationId, locationId, dataCutoffDate);
      await this.demandActualsRepo.upsertMany({ organizationId, locationId, rows: dailyRows });

      // 2. Previsão por fonte de procura ativa.
      const activeSources = await this.demandActualsRepo.listActiveDemandSources(organizationId, locationId, historyStart, dataCutoffDate);
      const demandPredictions: DemandPredictionInput[] = [];
      const confidenceBySource = new Map<string, { confidence: ConfidenceLevel; historyDays: number; wape: number | null }>();
      const demandPointConfidence = new Map<string, ConfidenceLevel>();

      for (const source of activeSources) {
        const identity = `${source.demandSourceType}:${source.demandSourceRef}`;
        const history = await this.demandActualsRepo.findHistory({
          organizationId,
          locationId,
          demandSourceType: source.demandSourceType,
          demandSourceRef: source.demandSourceRef,
          since: historyStart,
          until: dataCutoffDate,
        });
        const dailyActuals: DailyActual[] = history.map((h) => ({ date: h.saleDate, quantity: h.quantitySold }));
        const predictions = this.forecastModel.predict({ history: dailyActuals, horizonDays, horizonStartDate: horizonStart });
        const backtest = this.backtestForSource(dailyActuals);
        const sourceConfidence = computeConfidence({
          historyDaysAvailable: dailyActuals.length,
          backtestWape: backtest.wape,
          hasIncompleteMapping: false,
          pendingReviewsAffectingItem: false,
          hasNegativeOrStaleStock: false,
          daysSinceLastPhysicalCount: 0,
        });
        confidenceBySource.set(identity, { confidence: sourceConfidence, historyDays: dailyActuals.length, wape: backtest.wape });
        demandPointConfidence.set(identity, sourceConfidence);

        for (const p of predictions) {
          demandPredictions.push({
            demandSourceType: source.demandSourceType,
            demandSourceRef: source.demandSourceRef,
            date: p.date,
            predictedQuantity: p.predictedQuantity,
          });
        }
      }

      // 3. Converte previsão de vendas em consumo por item de stock (adapter legacy).
      const conversion = await this.recipeConsumption.convert(organizationId, demandPredictions);
      const consumptionByItem = new Map<string, ForecastRequirementDay[]>();
      for (const row of conversion.byStockItemAndDate) {
        const list = consumptionByItem.get(row.stockItemId) ?? [];
        list.push({ date: row.date, expectedConsumption: row.expectedConsumption });
        consumptionByItem.set(row.stockItemId, list);
      }
      for (const list of consumptionByItem.values()) list.sort((a, b) => a.date.localeCompare(b.date));

      // Fontes de procura por item (para confiança e simulação de impacto).
      const sourcesByItem = new Map<string, Set<string>>();
      for (const c of conversion.contributions) {
        const set = sourcesByItem.get(c.stockItemId) ?? new Set<string>();
        set.add(`${c.demandSourceType}:${c.demandSourceRef}`);
        sourcesByItem.set(c.stockItemId, set);
      }
      const hasIncompleteMapping = conversion.incompleteDemandSources.length > 0;

      // 4-8. Projeção, stock de segurança, reposição, alertas — por item.
      const stockItems = await this.stockItemPlanningRead.listActive(organizationId);
      const quantities = await this.stockQuantityRead.getQuantities(
        organizationId,
        stockItems.map((i) => i.id),
      );

      const stockRequirementRows: ForecastStockRequirementRow[] = [];
      const recommendationRows: ReplenishmentRecommendationRow[] = [];
      const alertsToUpsert: PlanningAlert[] = [];
      const presentFingerprints: string[] = [];

      for (const item of stockItems) {
        const requirements = consumptionByItem.get(item.id) ?? [];
        const snapshot = quantities.get(item.id) ?? { stockItemId: item.id, currentQuantity: 0, lastPurchaseUnitCostWithoutVat: null };
        const projection = computeStockProjection(snapshot.currentQuantity, requirements);

        for (const point of projection.points) {
          stockRequirementRows.push({
            stockItemId: item.id,
            forecastDate: point.date,
            expectedConsumption: point.expectedConsumption,
            cumulativeConsumption: point.cumulativeConsumption,
          });
        }

        const pendingReview = await this.pendingPurchaseReviewRead.hasPendingReviewForItem(organizationId, item.id);
        const countSignal = await this.stockCountSignalRead.getSignalForItem(organizationId, item.id);
        const daysSinceCount = countSignal.lastCompletedCountAt ? diffDaysISO(dataCutoffDate, countSignal.lastCompletedCountAt.toISOString().slice(0, 10)) : null;

        const contributingSources = [...(sourcesByItem.get(item.id) ?? [])];
        let itemHistoryDays = 0;
        let itemWape: number | null = null;
        if (contributingSources.length > 0) {
          const stats = contributingSources.map((id) => confidenceBySource.get(id)).filter((s): s is NonNullable<typeof s> => s != null);
          itemHistoryDays = stats.length > 0 ? Math.min(...stats.map((s) => s.historyDays)) : 0;
          const wapes = stats.map((s) => s.wape).filter((w): w is number => w != null);
          itemWape = wapes.length > 0 ? Math.max(...wapes) : null;
        }

        const itemConfidence = computeConfidence({
          historyDaysAvailable: itemHistoryDays,
          backtestWape: itemWape,
          hasIncompleteMapping,
          pendingReviewsAffectingItem: pendingReview,
          hasNegativeOrStaleStock: snapshot.currentQuantity < 0,
          daysSinceLastPhysicalCount: daysSinceCount,
        });

        // Alertas (secções 71-80) — poucos, sempre acionáveis.
        const itemAlerts = await this.collectItemAlerts(
          organizationId,
          locationId,
          item.id,
          snapshot,
          projection,
          requirements,
          countSignal.slowMovingDaysThreshold,
          dataCutoffDate,
          item.purchaseReferenceUnitCostWithoutVat,
        );
        for (const a of itemAlerts) {
          alertsToUpsert.push(a);
          presentFingerprints.push(a.fingerprint);
        }

        // Reposição — só quando há histórico de consumo para este item.
        if (requirements.length > 0) {
          const packagingOptions = await this.learnedMappingRead.findAllForItem(organizationId, item.id);
          const chosenSupplier = packagingOptions[0] ?? null;
          const schedule = chosenSupplier
            ? await this.supplierDeliveryScheduleRead.findForSupplier(organizationId, chosenSupplier.supplierId, locationId)
            : null;
          const deliveryWindows = chosenSupplier ? computeNextDeliveryWindows(schedule?.weekdays ?? null, schedule?.cutoffTime ?? null, dataCutoffDate, null, 2) : [];

          const leadTimeDays = deliveryWindows[0] ? diffDaysISO(deliveryWindows[0].date, dataCutoffDate) : DEFAULT_LEAD_TIME_DAYS;
          const safetyStock = computeSafetyStock({
            recentDailyConsumption: requirements.slice(0, 14).map((r) => r.expectedConsumption),
            leadTimeDays,
            configuredSafetyStockQty: item.safetyStockQty,
            minStockQty: item.minStockQty,
          });

          const consumptionUntil = (untilDate: string): number =>
            requirements.filter((r) => r.date <= untilDate).reduce((sum, r) => sum + r.expectedConsumption, 0);

          const d1 = deliveryWindows[0]?.date ?? addDaysISO(dataCutoffDate, leadTimeDays);
          const d2 = deliveryWindows[1]?.date ?? addDaysISO(d1, leadTimeDays);
          const projectedAtD1 = snapshot.currentQuantity - consumptionUntil(d1);
          const targetStock = safetyStock.suggestedQty + consumptionUntil(d2) - consumptionUntil(d1);

          const replenishment = computeReplenishment({
            projectedStockAtWindow: projectedAtD1,
            targetStock,
            packaging: chosenSupplier ? { conversionFactor: chosenSupplier.conversionFactor, purchaseUnit: chosenSupplier.purchaseUnit } : null,
          });

          if (replenishment.suggestedBaseQty > 0) {
            recommendationRows.push({
              stockItemId: item.id,
              supplierId: chosenSupplier?.supplierId ?? null,
              stockNow: snapshot.currentQuantity,
              projectedAtWindow: projectedAtD1,
              targetStock,
              safetyStock: safetyStock.suggestedQty,
              suggestedBaseQty: replenishment.suggestedBaseQty,
              suggestedPurchaseQty: replenishment.suggestedPurchaseQty,
              purchaseUnit: replenishment.purchaseUnit,
              estimatedCost:
                item.purchaseReferenceUnitCostWithoutVat != null ? item.purchaseReferenceUnitCostWithoutVat * replenishment.suggestedBaseQty : null,
              confidence: itemConfidence,
              explanationData: {
                nextDeliveryDate: deliveryWindows[0]?.date ?? null,
                followingDeliveryDate: deliveryWindows[1]?.date ?? null,
                safetyStockBasis: safetyStock.basis,
                leadTimeDays,
                ruptureDate: projection.ruptureDate,
                coverageDays: projection.coverageDays,
              },
            });
          }
        }
      }

      // Auto-resolve de alertas cuja condição desapareceu (secção 73).
      const staleAlerts = await this.planningAlertRepo.findStaleActiveAlerts(organizationId, locationId, presentFingerprints);
      for (const stale of staleAlerts) alertsToUpsert.push(stale.autoResolve());
      await this.planningAlertRepo.upsertMany(organizationId, alertsToUpsert);

      const demandPointRows = demandPredictions.map((p) => ({
        demandSourceType: p.demandSourceType,
        demandSourceRef: p.demandSourceRef,
        forecastDate: p.date,
        predictedQuantity: p.predictedQuantity,
        confidence: demandPointConfidence.get(`${p.demandSourceType}:${p.demandSourceRef}`) ?? ("baixa" as ConfidenceLevel),
      }));

      const qualityScore = this.computeRunQualityScore(confidenceBySource);
      run = run.complete(qualityScore);
      await this.forecastRunRepo.saveRunResult({
        organizationId,
        run,
        demandPoints: demandPointRows,
        stockRequirements: stockRequirementRows,
        recommendations: recommendationRows,
      });

      const activeAlertsCount = alertsToUpsert.filter((a) => a.state === "active").length;
      return {
        locationId,
        runId: run.id,
        status: run.status,
        demandSourcesForecast: activeSources.length,
        stockItemsProjected: stockItems.length,
        recommendationsGenerated: recommendationRows.length,
        alertsActive: activeAlertsCount,
      };
    } catch (error) {
      run = run.fail();
      await this.forecastRunRepo.markRunFailed(organizationId, run);
      throw error;
    }
  }

  private backtestForSource(dailyActuals: DailyActual[]): { wape: number | null } {
    if (dailyActuals.length < HISTORY_WINDOW_DAYS_MIN_FOR_BACKTEST) return { wape: null };
    const train = dailyActuals.slice(0, -BACKTEST_HOLDOUT_DAYS);
    const holdout = dailyActuals.slice(-BACKTEST_HOLDOUT_DAYS);
    const firstHoldoutDate = holdout[0]?.date;
    if (!firstHoldoutDate) return { wape: null };
    const predicted = this.forecastModel.predict({ history: train, horizonDays: holdout.length, horizonStartDate: firstHoldoutDate });
    const points: BacktestPoint[] = holdout.map((actual, i) => ({ predicted: predicted[i]?.predictedQuantity ?? 0, actual: actual.quantity }));
    return { wape: computeBacktest(points).wape };
  }

  private async collectItemAlerts(
    organizationId: OrganizationId,
    locationId: string,
    itemId: string,
    snapshot: { currentQuantity: number; lastPurchaseUnitCostWithoutVat: number | null },
    projection: ReturnType<typeof computeStockProjection>,
    requirements: ForecastRequirementDay[],
    slowMovingDaysThreshold: number | null,
    _dataCutoffDate: string,
    referenceUnitCost: number | null,
  ): Promise<PlanningAlert[]> {
    const candidates: { type: PlanningAlertType; severity: PlanningAlertSeverity; context: Record<string, unknown> }[] = [];

    if (projection.ruptureDate) {
      const daysToRupture = diffDaysISO(projection.ruptureDate, _dataCutoffDate);
      const severity: PlanningAlertSeverity = daysToRupture <= 1 ? "critica" : daysToRupture <= 3 ? "alta" : "media";
      candidates.push({ type: "stockout_risk", severity, context: { ruptureDate: projection.ruptureDate, coverageDays: projection.coverageDays } });
    }

    const noForecastedDemand = requirements.length === 0 || requirements.every((r) => r.expectedConsumption === 0);
    if (noForecastedDemand && snapshot.currentQuantity > 0 && slowMovingDaysThreshold != null) {
      candidates.push({ type: "excess_stock", severity: "baixa", context: { slowMovingDaysThreshold, currentQuantity: snapshot.currentQuantity } });
    }

    if (snapshot.currentQuantity < 0) {
      candidates.push({ type: "data_quality_warning", severity: "baixa", context: { currentQuantity: snapshot.currentQuantity } });
    }

    const priceAnomaly = detectPriceAnomaly({
      lastPurchaseUnitCost: snapshot.lastPurchaseUnitCostWithoutVat,
      referenceUnitCost,
      thresholdPercent: PRICE_ANOMALY_THRESHOLD_PERCENT,
    });
    if (priceAnomaly.isAnomaly) {
      candidates.push({ type: "price_anomaly", severity: "media", context: { deviationPercent: priceAnomaly.deviationPercent } });
    }

    const alerts: PlanningAlert[] = [];
    for (const c of candidates) {
      const fingerprint = buildAlertFingerprint(organizationId, locationId, itemId, c.type);
      const existing = await this.planningAlertRepo.findByFingerprint(organizationId, fingerprint);
      alerts.push(
        existing
          ? existing.refresh(c.severity, c.context)
          : PlanningAlert.create({ organizationId, locationId, itemId, alertType: c.type, severity: c.severity, contextSnapshot: c.context }),
      );
    }
    return alerts;
  }

  private computeRunQualityScore(confidenceBySource: Map<string, { confidence: ConfidenceLevel; historyDays: number; wape: number | null }>): number | null {
    const values = [...confidenceBySource.values()];
    if (values.length === 0) return null;
    const sum = values.reduce((acc, v) => acc + CONFIDENCE_RANK[v.confidence], 0);
    return Math.round((sum / (values.length * 2)) * 1000) / 1000;
  }
}
