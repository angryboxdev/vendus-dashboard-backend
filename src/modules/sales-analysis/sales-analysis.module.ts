import type { Router } from "express";
import type { GetSummaryPort as VendusGetSummaryPort } from "../vendus/domain/ports/in/get-summary.port.js";
import type { GetSummaryPort as AirMenuGetSummaryPort } from "../air-menu/domain/ports/in/get-summary.port.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { VendusSalesSourceAdapter } from "./adapters/out/vendus-sales-source.adapter.js";
import { AirMenuSalesSourceAdapter } from "./adapters/out/air-menu-sales-source.adapter.js";
import { SupabaseSalesBucketStoreAdapter } from "./adapters/out/supabase-sales-bucket-store.adapter.js";
import { LisbonClockAdapter } from "./adapters/out/lisbon-clock.adapter.js";
import { createForecastModel, type ForecastProviderConfig } from "./adapters/out/llm-forecast-model.adapter.js";
import { AirMenuFetchCoordinator, VendusFillCoordinator } from "./application/background-fills.js";
import {
  FetchAirMenuMonthUseCase, GetSalesAnalysisUseCase, GetSalesForecastUseCase, TodayVendusCache,
} from "./application/use-cases/sales-analysis.use-cases.js";
import { SalesAnalysisController } from "./adapters/in/sales-analysis.controller.js";

export interface SalesAnalysisModuleConfig {
  /** Enterprise AirMenu da loja principal (ADR-0012). */
  airMenuEnterpriseId: string;
  /** Fornecedor de IA para a previsão (o mesmo do Assistente). */
  forecast: ForecastProviderConfig;
}

/** Composition root da Análise de Vendas. */
export function createSalesAnalysisModule(
  vendusGetSummary: VendusGetSummaryPort,
  airMenuGetSummary: AirMenuGetSummaryPort,
  config: SalesAnalysisModuleConfig,
): { router: Router } {
  const vendus = new VendusSalesSourceAdapter(vendusGetSummary);
  const airMenu = new AirMenuSalesSourceAdapter(airMenuGetSummary, config.airMenuEnterpriseId);
  const store = new SupabaseSalesBucketStoreAdapter(createScopedQuery);
  const clock = new LisbonClockAdapter();
  const model = createForecastModel(config.forecast);

  const vendusFill = new VendusFillCoordinator(vendus, store);
  const airMenuJobs = new AirMenuFetchCoordinator(airMenu, store, clock);
  const todayVendus = new TodayVendusCache(vendus);

  const controller = new SalesAnalysisController(
    new GetSalesAnalysisUseCase(store, vendusFill, todayVendus, airMenuJobs, clock),
    new FetchAirMenuMonthUseCase(airMenuJobs, clock),
    new GetSalesForecastUseCase(store, vendusFill, model, clock),
  );
  return { router: controller.router };
}
