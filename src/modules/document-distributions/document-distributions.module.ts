import type { Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { createDistributionsRouter } from "./adapters/in/distributions.controller.js";
import { SupabaseDistributionFilesAdapter } from "./adapters/out/supabase-distribution-files.adapter.js";
import { SupabaseDistributionsRepository } from "./adapters/out/supabase-distributions.repository.js";
import { DistributionsUseCases } from "./application/use-cases/distributions.use-cases.js";
import type { DistributionsContextPort } from "./domain/ports/out/distributions.ports.js";

/** Composition root do Novo RH → Documentos: envio a vários colaboradores (FE-065). */
export function createDocumentDistributionsModule(deps: { context: DistributionsContextPort }): { router: Router; distributions: DistributionsUseCases } {
  const distributions = new DistributionsUseCases(new SupabaseDistributionsRepository(createScopedQuery), new SupabaseDistributionFilesAdapter(), deps.context);
  return { router: createDistributionsRouter(distributions, new SupabaseIdempotencyStore(createScopedQuery)), distributions };
}
