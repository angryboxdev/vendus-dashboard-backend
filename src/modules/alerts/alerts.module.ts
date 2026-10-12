import type { Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { createAlertsRouter } from "./adapters/in/alerts.controller.js";
import { SupabaseAlertsRepository } from "./adapters/out/supabase-alerts.repository.js";
import { AlertsUseCases } from "./application/use-cases/alerts.use-cases.js";
import type { AlertsContextPort } from "./domain/ports/out/alerts.ports.js";

/** Composition root do Novo RH → Alertas (Fase 9). As origens vêm dos outros módulos. */
export function createAlertsModule(deps: { context: AlertsContextPort }): { router: Router; alerts: AlertsUseCases } {
  const alerts = new AlertsUseCases(new SupabaseAlertsRepository(createScopedQuery), deps.context);
  return { router: createAlertsRouter(alerts, new SupabaseIdempotencyStore(createScopedQuery)), alerts };
}
