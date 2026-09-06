import type { Router } from "express";
import type { OrganizationId } from "../../kernel/organization-id.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import type { VendusGatewayPort } from "./domain/ports/out/vendus-gateway.port.js";
import { VendusHttpGateway } from "./adapters/out/vendus-http.gateway.js";
import { VendusProductCatalogAdapter } from "./adapters/out/vendus-product-catalog.adapter.js";
import { SupabaseAnalyticsCacheAdapter } from "./adapters/out/supabase-analytics-cache.adapter.js";
import { SupabaseVendusCredentialsAdapter } from "./adapters/out/supabase-vendus-credentials.adapter.js";
import { SupabaseVendusLocationConfigAdapter } from "./adapters/out/supabase-vendus-location-config.adapter.js";
import { GetSummaryUseCase } from "./application/use-cases/get-summary.use-case.js";
import { GetAnalyticsCurrentUseCase } from "./application/use-cases/get-analytics-current.use-case.js";
import { GetAnalyticsHistoricalUseCase } from "./application/use-cases/get-analytics-historical.use-case.js";
import { GetDocumentDetailUseCase } from "./application/use-cases/get-document-detail.use-case.js";
import { ListDocumentsUseCase } from "./application/use-cases/list-documents.use-case.js";
import { GetSelfConsumptionUseCase } from "./application/use-cases/get-selfconsumption.use-case.js";
import { ResolveVendusBootConfigUseCase } from "./application/use-cases/resolve-vendus-boot-config.use-case.js";
import { VendusController } from "./adapters/in/vendus.controller.js";
import type { GetSummaryPort } from "./domain/ports/in/get-summary.port.js";
import type { VendusBootConfig } from "./domain/ports/in/resolve-vendus-boot-config.port.js";

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
 * Isolamento por organização (spec B2, ADR-0008 — ver README): o módulo fala
 * sobretudo com a API HTTP do Vendus, não com o Supabase, por isso só
 * `SupabaseAnalyticsCacheAdapter` recebe o `createScopedQuery` factory
 * (D2) em vez de um `SupabaseClient` directo. Os outros dois adapters de
 * saída (`VendusHttpGateway`, `VendusProductCatalogAdapter`) não constroem
 * nenhuma query Supabase e por isso ficam fora do padrão.
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
  const analyticsCache = new SupabaseAnalyticsCacheAdapter(createScopedQuery);

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

/**
 * Boot-time resolution (ticket 03): resolves the Vendus API key and the
 * location's register id / price-group / payment-method ids from the
 * database, replacing `VENDUS_API_KEY`, `VENDUS_REGISTER_ID`
 * (`UBER_EATS_VENDUS_REGISTER_ID`) and the four price-group/payment-ID env
 * vars. Called once by `server.ts`, before `createVendusModule` and
 * `createCashClosingsModule` — not a per-request path. Throws if either the
 * organization's credentials or the location's config is missing (see
 * `ResolveVendusBootConfigUseCase`).
 */
export async function resolveVendusBootConfig(
  organizationId: OrganizationId,
  locationId: string,
): Promise<VendusBootConfig> {
  const credentials = new SupabaseVendusCredentialsAdapter(createScopedQuery);
  const locationConfig = new SupabaseVendusLocationConfigAdapter(createScopedQuery);
  const useCase = new ResolveVendusBootConfigUseCase(credentials, locationConfig);
  return useCase.execute({ organizationId, locationId });
}
