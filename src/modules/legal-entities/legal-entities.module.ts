import type { Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { createLegalEntitiesRouter } from "./adapters/in/legal-entities.controller.js";
import { SupabaseLegalEntitiesRepository } from "./adapters/out/supabase-legal-entities.repository.js";
import { LegalEntitiesUseCases } from "./application/use-cases/legal-entities.use-cases.js";
import type { LegalEntitiesContextPort } from "./domain/ports/out/legal-entities.ports.js";

/** Composition root do Novo RH → Entidades legais (FE-092/FE-093). */
export function createLegalEntitiesModule(deps: { context: LegalEntitiesContextPort }): { router: Router; legalEntities: LegalEntitiesUseCases } {
  const legalEntities = new LegalEntitiesUseCases(new SupabaseLegalEntitiesRepository(createScopedQuery), deps.context);
  return { router: createLegalEntitiesRouter(legalEntities, new SupabaseIdempotencyStore(createScopedQuery)), legalEntities };
}
