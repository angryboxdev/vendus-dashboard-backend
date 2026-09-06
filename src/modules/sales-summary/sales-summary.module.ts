import type { Router } from "express";
import type { GetSummaryPort as VendusGetSummaryPort } from "../vendus/domain/ports/in/get-summary.port.js";
import type { GetSummaryPort as AirMenuGetSummaryPort } from "../air-menu/domain/ports/in/get-summary.port.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { VendusSummaryAdapter } from "./adapters/out/vendus-summary.adapter.js";
import { AirMenuSummaryAdapter } from "./adapters/out/air-menu-summary.adapter.js";
import { SupabaseSalesSummaryCacheAdapter } from "./adapters/out/supabase-sales-summary-cache.adapter.js";
import { SalesSummaryCalculatorService } from "./domain/services/sales-summary-calculator.service.js";
import { GetSalesSummaryUseCase } from "./application/use-cases/get-sales-summary.use-case.js";
import { GetGrowthChartUseCase } from "./application/use-cases/get-growth-chart.use-case.js";
import { SalesSummaryController } from "./adapters/in/sales-summary.controller.js";

export interface SalesSummaryModuleConfig {
  /** AirMenu enterprise ID to aggregate (Angry Box main — see ADR-0012). */
  salesSummaryEnterpriseId: string;
}

/**
 * Composition root for the sales-summary module.
 *
 * Receives the live source ports from the vendus and air-menu modules —
 * they are already assembled by their own composition roots and exported.
 */
export function createSalesSummaryModule(
  vendusGetSummary: VendusGetSummaryPort,
  airMenuGetSummary: AirMenuGetSummaryPort,
  config: SalesSummaryModuleConfig,
): { router: Router } {
  // Output adapters
  const vendusAdapter = new VendusSummaryAdapter(vendusGetSummary);
  const airMenuAdapter = new AirMenuSummaryAdapter(
    airMenuGetSummary,
    config.salesSummaryEnterpriseId,
  );
  const cacheAdapter = new SupabaseSalesSummaryCacheAdapter(createScopedQuery);

  // Domain service
  const calculator = new SalesSummaryCalculatorService();

  // Use cases
  const getSalesSummary = new GetSalesSummaryUseCase(
    vendusAdapter,
    airMenuAdapter,
    cacheAdapter,
    calculator,
  );
  const getGrowthChart = new GetGrowthChartUseCase(cacheAdapter, getSalesSummary);

  // Input adapter
  const controller = new SalesSummaryController(getSalesSummary, getGrowthChart);

  return { router: controller.router };
}
