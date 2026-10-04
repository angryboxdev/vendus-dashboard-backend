import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { SupabaseLocationRepository } from "./adapters/out/supabase-location.repository.js";
import { SupabaseLocationAuditLogAdapter } from "./adapters/out/supabase-location-audit-log.adapter.js";
import { ListLocationsUseCase } from "./application/use-cases/list-locations.use-case.js";
import {
  CreateLocationUseCase,
  ListLocationHistoryUseCase,
  SetLocationActiveUseCase,
  UpdateLocationUseCase,
} from "./application/use-cases/manage-locations.use-cases.js";
import { LocationController } from "./adapters/in/location.controller.js";
import type { ListLocationsPort } from "./domain/ports/in/list-locations.port.js";

/**
 * Composition root do módulo locations (spec B2 ticket 01/D15; gestão desde
 * a Base Organizacional, ticket 02).
 *
 * Só este ficheiro conhece os adapters concretos — os use cases e o domínio
 * só conhecem os ports. Seguindo D2, os adapters não constroem o seu próprio
 * `ScopedQuery`: recebem o factory `createScopedQuery` injectado aqui, no
 * composition root, e constroem um helper escopado por chamada.
 */
export function createLocationsModule(): { router: Router; listLocations: ListLocationsPort } {
  const locationRepository = new SupabaseLocationRepository(createScopedQuery);
  const auditLog = new SupabaseLocationAuditLogAdapter(createScopedQuery);
  const listLocations = new ListLocationsUseCase(locationRepository);
  const controller = new LocationController(
    listLocations,
    new CreateLocationUseCase(locationRepository, auditLog),
    new UpdateLocationUseCase(locationRepository, auditLog),
    new SetLocationActiveUseCase(locationRepository, auditLog),
    new ListLocationHistoryUseCase(locationRepository, auditLog),
  );

  return { router: controller.router, listLocations };
}
