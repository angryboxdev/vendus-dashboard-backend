import type { Router } from "express";
import { organizationInfo } from "../../infra/scoped-db/demo-organization.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { createGoogleReviewsRouter } from "./adapters/in/google-reviews.controller.js";
import { HttpGooglePlacesGateway } from "./adapters/out/google-places.gateway.js";
import { SupabasePlaceLinksRepository } from "./adapters/out/supabase-place-links.repository.js";
import { GoogleReviewsUseCases } from "./application/use-cases/google-reviews.use-cases.js";
import type { DemoOrgCheckPort, GoogleReviewsAuditPort, LocationsSourcePort } from "./domain/ports/out/google-reviews.ports.js";

/**
 * Composition root das Avaliações Google. Sem `apiKey` (variável
 * GOOGLE_PLACES_API_KEY vazia) o módulo responde "não configurado" e o
 * Dashboard continua a funcionar.
 */
export function createGoogleReviewsModule(deps: { apiKey: string | undefined; locations: LocationsSourcePort; audit: GoogleReviewsAuditPort; demo?: DemoOrgCheckPort }): { router: Router; reviews: GoogleReviewsUseCases } {
  const key = deps.apiKey?.trim();
  const reviews = new GoogleReviewsUseCases(key ? new HttpGooglePlacesGateway(key) : null, new SupabasePlaceLinksRepository(createScopedQuery), deps.locations, deps.audit, undefined, deps.demo ?? cachedDemoCheck());
  return { router: createGoogleReviewsRouter(reviews), reviews };
}

/** «É a organização de demonstração?» com cache curto (5 min) — evita uma leitura por pedido. */
function cachedDemoCheck(): DemoOrgCheckPort {
  const cache = new Map<string, { at: number; demo: boolean }>();
  return {
    isDemo: async (org) => {
      const hit = cache.get(org);
      if (hit && Date.now() - hit.at < 5 * 60_000) return hit.demo;
      const demo = (await organizationInfo(org))?.isDemo === true;
      cache.set(org, { at: Date.now(), demo });
      return demo;
    },
  };
}
