import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { createGoogleReviewsRouter } from "./adapters/in/google-reviews.controller.js";
import { HttpGooglePlacesGateway } from "./adapters/out/google-places.gateway.js";
import { SupabasePlaceLinksRepository } from "./adapters/out/supabase-place-links.repository.js";
import { GoogleReviewsUseCases } from "./application/use-cases/google-reviews.use-cases.js";
import type { GoogleReviewsAuditPort, LocationsSourcePort } from "./domain/ports/out/google-reviews.ports.js";

/**
 * Composition root das Avaliações Google. Sem `apiKey` (variável
 * GOOGLE_PLACES_API_KEY vazia) o módulo responde "não configurado" e o
 * Dashboard continua a funcionar.
 */
export function createGoogleReviewsModule(deps: { apiKey: string | undefined; locations: LocationsSourcePort; audit: GoogleReviewsAuditPort }): { router: Router; reviews: GoogleReviewsUseCases } {
  const key = deps.apiKey?.trim();
  const reviews = new GoogleReviewsUseCases(key ? new HttpGooglePlacesGateway(key) : null, new SupabasePlaceLinksRepository(createScopedQuery), deps.locations, deps.audit);
  return { router: createGoogleReviewsRouter(reviews), reviews };
}
