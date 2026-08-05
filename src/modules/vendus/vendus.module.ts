import type { Router } from "express";
import type { VendusGatewayPort } from "./domain/ports/out/vendus-gateway.port.js";
import { VendusHttpGateway } from "./adapters/out/vendus-http.gateway.js";
import { VendusProductCatalogAdapter } from "./adapters/out/vendus-product-catalog.adapter.js";
import { SupabaseAnalyticsCacheAdapter } from "./adapters/out/supabase-analytics-cache.adapter.js";
import { GetSummaryUseCase } from "./application/use-cases/get-summary.use-case.js";
import { GetAnalyticsCurrentUseCase } from "./application/use-cases/get-analytics-current.use-case.js";
import { GetAnalyticsHistoricalUseCase } from "./application/use-cases/get-analytics-historical.use-case.js";
import { GetDocumentDetailUseCase } from "./application/use-cases/get-document-detail.use-case.js";
import { ListDocumentsUseCase } from "./application/use-cases/list-documents.use-case.js";
import { GetSelfConsumptionUseCase } from "./application/use-cases/get-selfconsumption.use-case.js";
import { VendusController } from "./adapters/in/vendus.controller.js";
import type { GetSummaryPort } from "./domain/ports/in/get-summary.port.js";

export interface VendusModuleConfig {
  eatzPaymentId: number;
  appsPaymentId: number;
  salaoPriceGroupId: number;
  eatzPriceGroupId: number;
  concurrency: number;
  historyStartYear: number;
}

/**
 * Composition root do módulo Vendus.
 *
 * Este é o ÚNICO lugar que conhece as implementações concretas dos adapters.
 * Todos os outros ficheiros (use cases, domínio) dependem apenas de ports.
 *
 * Expõe:
 *  - `router`      — montado em server.ts em /api (requer auth manager+)
 *  - `getSummary`  — injetável noutros módulos (ex: cash-closings)
 */
export function createVendusModule(config: VendusModuleConfig): {
  router: Router;
  getSummary: GetSummaryPort;
  gateway: VendusGatewayPort;
} {
  // Adapters de saída
  const gateway = new VendusHttpGateway();
  const productCatalog = new VendusProductCatalogAdapter(
    config.salaoPriceGroupId,
    config.eatzPriceGroupId,
  );
  const analyticsCache = new SupabaseAnalyticsCacheAdapter();

  // Use cases
  const getSummary = new GetSummaryUseCase(
    gateway,
    productCatalog,
    config.eatzPaymentId,
    config.appsPaymentId,
    config.concurrency,
  );
  const getAnalyticsCurrent = new GetAnalyticsCurrentUseCase(gateway);
  const getAnalyticsHistorical = new GetAnalyticsHistoricalUseCase(
    gateway,
    analyticsCache,
    config.historyStartYear,
  );
  const getDocumentDetail = new GetDocumentDetailUseCase(
    gateway,
    productCatalog,
    config.eatzPaymentId,
    config.appsPaymentId,
  );
  const listDocuments = new ListDocumentsUseCase(gateway);
  const getSelfConsumption = new GetSelfConsumptionUseCase(
    gateway,
    productCatalog,
    config.concurrency,
  );

  // Adapter de entrada
  const controller = new VendusController(
    getAnalyticsCurrent,
    getAnalyticsHistorical,
    getSummary,
    getDocumentDetail,
    listDocuments,
    getSelfConsumption,
  );

  return { router: controller.router, getSummary, gateway };
}
