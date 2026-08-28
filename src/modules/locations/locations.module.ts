import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { SupabaseLocationRepository } from "./adapters/out/supabase-location.repository.js";
import { ListLocationsUseCase } from "./application/use-cases/list-locations.use-case.js";
import { LocationController } from "./adapters/in/location.controller.js";

/**
 * Composition root do módulo locations (spec B2 ticket 01/D15).
 *
 * Só este ficheiro conhece o adapter concreto — o use case e o domínio só
 * conhecem `LocationRepositoryPort`. Seguindo D2, o adapter não constrói o
 * seu próprio `ScopedQuery`: recebe o factory `createScopedQuery` injectado
 * aqui, no composition root, e constrói um helper escopado por chamada.
 */
export function createLocationsModule(): { router: Router } {
  const locationRepository = new SupabaseLocationRepository(createScopedQuery);
  const listLocations = new ListLocationsUseCase(locationRepository);
  const controller = new LocationController(listLocations);

  return { router: controller.router };
}
