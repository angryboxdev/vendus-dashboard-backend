import type { Router } from "express";
import type { GetSummaryPort as VendusGetSummaryPort } from "../vendus/domain/ports/in/get-summary.port.js";
import type { GetSummaryPort as AirMenuGetSummaryPort } from "../air-menu/domain/ports/in/get-summary.port.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { VendusSalesSourceAdapter } from "./adapters/out/vendus-sales-source.adapter.js";
import { AirMenuSalesSourceAdapter } from "./adapters/out/air-menu-sales-source.adapter.js";
import { SupabaseSalesBucketStoreAdapter } from "./adapters/out/supabase-sales-bucket-store.adapter.js";
import { LisbonClockAdapter } from "./adapters/out/lisbon-clock.adapter.js";
import { createForecastModel, type ForecastProviderConfig } from "./adapters/out/llm-forecast-model.adapter.js";
import { AirMenuFetchCoordinator, DailyAirMenuSync, VendusFillCoordinator } from "./application/background-fills.js";
import type { OrganizationId } from "../../kernel/organization-id.js";
import {
  FetchAirMenuMonthUseCase, GetSalesAnalysisUseCase, GetSalesForecastUseCase, TodayVendusCache,
} from "./application/use-cases/sales-analysis.use-cases.js";
import { SalesAnalysisController } from "./adapters/in/sales-analysis.controller.js";

export interface SalesAnalysisModuleConfig {
  /** Enterprise AirMenu da loja principal (ADR-0012). */
  airMenuEnterpriseId: string;
  /** Fornecedor de IA para a previsão (o mesmo do Assistente). */
  forecast: ForecastProviderConfig;
  /**
   * Busca diária automática do dia anterior da AirMenu para esta organização
   * (loja principal), a partir das 5h de Lisboa. null = desligada.
   */
  dailyAirMenuSyncOrganizationId: OrganizationId | null;
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

  if (config.dailyAirMenuSyncOrganizationId) {
    const daily = new DailyAirMenuSync(airMenuJobs, store, clock, config.dailyAirMenuSyncOrganizationId);
    // Verifica a cada 10 min; só atua uma vez por dia, depois das 5h. unref: não segura o processo.
    setInterval(() => void daily.tick(), 10 * 60_000).unref();
  }

  const controller = new SalesAnalysisController(
    new GetSalesAnalysisUseCase(store, vendusFill, todayVendus, airMenuJobs, clock),
    new FetchAirMenuMonthUseCase(airMenuJobs, clock),
    new GetSalesForecastUseCase(store, vendusFill, model, clock),
  );
  return { router: controller.router };
}
