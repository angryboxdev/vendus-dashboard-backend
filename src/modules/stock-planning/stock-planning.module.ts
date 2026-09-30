import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import type { ListLocationsPort } from "../locations/domain/ports/in/list-locations.port.js";
import type { GetSupplierPort } from "../financial-base/domain/ports/in/supplier.ports.js";
import type { ListSupplierDeliverySchedulesPort } from "../financial-base/domain/ports/in/supplier-delivery-schedule.ports.js";

import { WeekdaySeasonalBaselineModel } from "./domain/services/baseline-forecast.model.js";

import { SupabaseDemandActualsRepository } from "./adapters/out/supabase-demand-actuals.repository.js";
import { SupabaseForecastRunRepository } from "./adapters/out/supabase-forecast-run.repository.js";
import { SupabasePlanningAlertRepository } from "./adapters/out/supabase-planning-alert.repository.js";
import { SupabaseForecastFeedbackRepository } from "./adapters/out/supabase-forecast-feedback.repository.js";
import { SupabaseRecommendationReviewRepository } from "./adapters/out/supabase-recommendation-review.repository.js";
import { LegacyRecipeConsumptionAdapter } from "./adapters/out/legacy-recipe-consumption.adapter.js";
import { LegacyVendusSalesReadAdapter } from "./adapters/out/legacy-vendus-sales-read.adapter.js";
import { StockQuantityReadAdapter } from "./adapters/out/stock-quantity-read.adapter.js";
import { StockItemPlanningReadAdapter } from "./adapters/out/stock-item-planning-read.adapter.js";
import { SupplierDeliveryScheduleReadAdapter } from "./adapters/out/supplier-delivery-schedule-read.adapter.js";
import { LearnedMappingReadAdapter } from "./adapters/out/learned-mapping-read.adapter.js";
import { LocationsReadAdapter } from "./adapters/out/locations-read.adapter.js";
import { PendingPurchaseReviewReadAdapter } from "./adapters/out/pending-purchase-review-read.adapter.js";
import { StockCountSignalReadAdapter } from "./adapters/out/stock-count-signal-read.adapter.js";
import { FinancialBaseSupplierNameReadAdapter } from "./adapters/out/financial-base-supplier-name-read.adapter.js";

import { RunDailyForecastUseCase } from "./application/use-cases/run-daily-forecast.use-case.js";
import { BackfillDemandActualsUseCase } from "./application/use-cases/backfill-demand-actuals.use-case.js";
import { ListPlanningItemsUseCase } from "./application/use-cases/list-planning-items.use-case.js";
import { GetItemPlanningDetailUseCase } from "./application/use-cases/get-item-planning-detail.use-case.js";
import { ListPlanningAlertsUseCase } from "./application/use-cases/list-planning-alerts.use-case.js";
import { GetPlanningAlertDetailUseCase } from "./application/use-cases/get-planning-alert-detail.use-case.js";
import { AcknowledgeAlertUseCase } from "./application/use-cases/acknowledge-alert.use-case.js";
import { SilenceAlertUseCase } from "./application/use-cases/silence-alert.use-case.js";
import { GeneratePurchaseListUseCase } from "./application/use-cases/generate-purchase-list.use-case.js";
import { ReviewRecommendationUseCase } from "./application/use-cases/review-recommendation.use-case.js";
import { DetectForecastDeviationUseCase } from "./application/use-cases/detect-forecast-deviation.use-case.js";
import { SubmitForecastFeedbackUseCase } from "./application/use-cases/submit-forecast-feedback.use-case.js";
import { GetForecastHistoryUseCase } from "./application/use-cases/get-forecast-history.use-case.js";

import { StockPlanningController } from "./adapters/in/stock-planning.controller.js";
import type { RunDailyForecastPort, DetectForecastDeviationPort } from "./domain/ports/in/stock-planning.ports.js";

export interface StockPlanningModule {
  router: Router;
  runDailyForecast: RunDailyForecastPort;
  detectForecastDeviation: DetectForecastDeviationPort;
}

/**
 * Composition root do módulo `stock-planning` ("Planeamento de Stock").
 * Só lê de `financial-base` (D10 via ports: `GetSupplierPort`,
 * `ListSupplierDeliverySchedulesPort`) e de `locations` (D10, mesmo
 * `ListLocationsPort` já usado por `stock-purchase-review`/`stock-count`)
 * — sem depender das INSTÂNCIAS de `stockPurchaseReviewModule`/
 * `stockCountModule` em `server.ts`: os sinais que viriam de lá
 * (`stock_review_learned_mappings`, "compras por rever" pendentes, última
 * contagem física) são lidos diretamente das suas tabelas partilhadas via
 * `ScopedQuery` (ver `learned-mapping-read.adapter.ts`/
 * `pending-purchase-review-read.adapter.ts`/
 * `stock-count-signal-read.adapter.ts` — cada um documenta a razão de não
 * passar por um port formal desses módulos). Isto significa que a ordem de
 * construção em `server.ts` não impõe ciclo nenhum: só precisa de
 * `financialBaseModule`/`locationsModule` já existirem.
 */
export function createStockPlanningModule(listLocationsPort: ListLocationsPort, getSupplierPort: GetSupplierPort, listSupplierDeliverySchedulesPort: ListSupplierDeliverySchedulesPort): StockPlanningModule {
  const demandActualsRepo = new SupabaseDemandActualsRepository(createScopedQuery);
  const forecastRunRepo = new SupabaseForecastRunRepository(createScopedQuery);
  const planningAlertRepo = new SupabasePlanningAlertRepository(createScopedQuery);
  const forecastFeedbackRepo = new SupabaseForecastFeedbackRepository(createScopedQuery);
  const recommendationReviewRepo = new SupabaseRecommendationReviewRepository(createScopedQuery);

  const recipeConsumption = new LegacyRecipeConsumptionAdapter();
  const vendusSalesRead = new LegacyVendusSalesReadAdapter();
  const stockQuantityRead = new StockQuantityReadAdapter(createScopedQuery);
  const stockItemPlanningRead = new StockItemPlanningReadAdapter(createScopedQuery);
  const learnedMappingRead = new LearnedMappingReadAdapter(createScopedQuery);
  const locationRead = new LocationsReadAdapter(listLocationsPort);
  const pendingPurchaseReviewRead = new PendingPurchaseReviewReadAdapter(createScopedQuery);
  const stockCountSignalRead = new StockCountSignalReadAdapter(createScopedQuery);
  const supplierDeliveryScheduleRead = new SupplierDeliveryScheduleReadAdapter(listSupplierDeliverySchedulesPort);
  const supplierNameRead = new FinancialBaseSupplierNameReadAdapter(getSupplierPort);

  const forecastModel = new WeekdaySeasonalBaselineModel();

  const runDailyForecast = new RunDailyForecastUseCase(
    locationRead,
    demandActualsRepo,
    vendusSalesRead,
    recipeConsumption,
    stockQuantityRead,
    stockItemPlanningRead,
    forecastRunRepo,
    planningAlertRepo,
    supplierDeliveryScheduleRead,
    learnedMappingRead,
    pendingPurchaseReviewRead,
    stockCountSignalRead,
    forecastModel,
  );
  const backfillDemandActuals = new BackfillDemandActualsUseCase(locationRead, vendusSalesRead, demandActualsRepo);
  const listPlanningItems = new ListPlanningItemsUseCase(stockItemPlanningRead, stockQuantityRead, forecastRunRepo, planningAlertRepo, pendingPurchaseReviewRead, stockCountSignalRead);
  const getItemPlanningDetail = new GetItemPlanningDetailUseCase(
    stockItemPlanningRead,
    stockQuantityRead,
    forecastRunRepo,
    planningAlertRepo,
    pendingPurchaseReviewRead,
    stockCountSignalRead,
    recipeConsumption,
  );
  const listPlanningAlerts = new ListPlanningAlertsUseCase(planningAlertRepo, stockItemPlanningRead);
  const getPlanningAlertDetail = new GetPlanningAlertDetailUseCase(
    planningAlertRepo,
    stockItemPlanningRead,
    stockQuantityRead,
    forecastRunRepo,
    pendingPurchaseReviewRead,
    stockCountSignalRead,
    recipeConsumption,
  );
  const acknowledgeAlert = new AcknowledgeAlertUseCase(planningAlertRepo, stockItemPlanningRead);
  const silenceAlert = new SilenceAlertUseCase(planningAlertRepo, stockItemPlanningRead);
  const generatePurchaseList = new GeneratePurchaseListUseCase(forecastRunRepo, stockItemPlanningRead, supplierNameRead);
  const reviewRecommendation = new ReviewRecommendationUseCase(forecastRunRepo, recommendationReviewRepo);
  const detectForecastDeviation = new DetectForecastDeviationUseCase(locationRead, forecastRunRepo, demandActualsRepo, forecastFeedbackRepo);
  const submitForecastFeedback = new SubmitForecastFeedbackUseCase(forecastFeedbackRepo);
  const getForecastHistory = new GetForecastHistoryUseCase(forecastRunRepo, forecastFeedbackRepo);

  const controller = new StockPlanningController(
    listPlanningItems,
    getItemPlanningDetail,
    listPlanningAlerts,
    getPlanningAlertDetail,
    acknowledgeAlert,
    silenceAlert,
    generatePurchaseList,
    reviewRecommendation,
    submitForecastFeedback,
    getForecastHistory,
    runDailyForecast,
    backfillDemandActuals,
    detectForecastDeviation,
  );

  return { router: controller.router, runDailyForecast, detectForecastDeviation };
}
