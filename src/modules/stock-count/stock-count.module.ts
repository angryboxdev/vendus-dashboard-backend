import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import type { ListLocationsPort } from "../locations/domain/ports/in/list-locations.port.js";

import { SupabaseStockCountRepository } from "./adapters/out/supabase-stock-count.repository.js";
import { SupabaseStockCountZoneRepository } from "./adapters/out/supabase-stock-count-zone.repository.js";
import { SupabaseStockCountSettingsRepository } from "./adapters/out/supabase-stock-count-settings.repository.js";
import { SupabaseStockCountAuditLogAdapter } from "./adapters/out/supabase-stock-count-audit-log.adapter.js";
import { SupabaseStockMovementWriteAdapter } from "./adapters/out/supabase-stock-movement-write.adapter.js";
import { SupabaseStockItemCatalogAdapter } from "./adapters/out/supabase-stock-item-catalog.adapter.js";
import { SupabaseStockCategoryReadAdapter } from "./adapters/out/supabase-stock-category-read.adapter.js";
import { LocationsReadAdapter } from "./adapters/out/locations-read.adapter.js";

import { CreateCountSessionUseCase } from "./application/use-cases/create-count-session.use-case.js";
import { StartCountSessionUseCase } from "./application/use-cases/start-count-session.use-case.js";
import { SubmitCountAttemptUseCase } from "./application/use-cases/submit-count-attempt.use-case.js";
import { RequestRecountUseCase } from "./application/use-cases/request-recount.use-case.js";
import { ResolveCountLineUseCase } from "./application/use-cases/resolve-count-line.use-case.js";
import { FinishExecutionUseCase } from "./application/use-cases/finish-execution.use-case.js";
import { MarkSessionReadyUseCase } from "./application/use-cases/mark-session-ready.use-case.js";
import { ConfirmCountSessionUseCase } from "./application/use-cases/confirm-count-session.use-case.js";
import { CancelCountSessionUseCase } from "./application/use-cases/cancel-count-session.use-case.js";
import { ListCountSessionsUseCase } from "./application/use-cases/list-count-sessions.use-case.js";
import { GetCountSessionUseCase } from "./application/use-cases/get-count-session.use-case.js";
import { AddUnscopedItemToSessionUseCase } from "./application/use-cases/add-unscoped-item-to-session.use-case.js";
import { ListCountZonesUseCase } from "./application/use-cases/list-count-zones.use-case.js";
import { CreateCountZoneUseCase } from "./application/use-cases/create-count-zone.use-case.js";

import { StockCountController } from "./adapters/in/stock-count.controller.js";

export interface StockCountModule {
  router: Router;
}

/**
 * Composition root do módulo `stock-count` ("Contagem Física de Stock
 * 2.0"). Sem dependência de `invoices`/`financial-base`/
 * `stock-purchase-review` — só lê `locations` (D10, mesmo `ListLocationsPort`
 * já usado por `stock-purchase-review`) e escreve nas tabelas legacy
 * `stock_items`/`stock_movements`/`stock_categories` através dos seus
 * próprios adapters, nunca via serviços legacy.
 */
export function createStockCountModule(listLocationsPort: ListLocationsPort): StockCountModule {
  const repository = new SupabaseStockCountRepository(createScopedQuery);
  const zoneRepository = new SupabaseStockCountZoneRepository(createScopedQuery);
  const settingsRepository = new SupabaseStockCountSettingsRepository(createScopedQuery);
  const auditLog = new SupabaseStockCountAuditLogAdapter(createScopedQuery);
  const stockMovementWrite = new SupabaseStockMovementWriteAdapter(createScopedQuery);
  const itemCatalog = new SupabaseStockItemCatalogAdapter(createScopedQuery);
  const categoryRead = new SupabaseStockCategoryReadAdapter(createScopedQuery);
  const locationRead = new LocationsReadAdapter(listLocationsPort);

  const controller = new StockCountController(
    new ListCountSessionsUseCase(repository),
    new GetCountSessionUseCase(repository),
    new CreateCountSessionUseCase(repository, settingsRepository, locationRead, auditLog),
    new StartCountSessionUseCase(repository, itemCatalog, stockMovementWrite, auditLog),
    new SubmitCountAttemptUseCase(repository, itemCatalog, categoryRead, settingsRepository, stockMovementWrite, auditLog),
    new RequestRecountUseCase(repository, auditLog),
    new ResolveCountLineUseCase(repository, itemCatalog, auditLog),
    new FinishExecutionUseCase(repository, auditLog),
    new MarkSessionReadyUseCase(repository, auditLog),
    new ConfirmCountSessionUseCase(repository, stockMovementWrite, auditLog),
    new CancelCountSessionUseCase(repository, auditLog),
    new AddUnscopedItemToSessionUseCase(repository, itemCatalog, auditLog),
    new ListCountZonesUseCase(zoneRepository),
    new CreateCountZoneUseCase(zoneRepository),
  );

  return { router: controller.router };
}
