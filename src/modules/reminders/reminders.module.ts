import type { Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { createRemindersRouter } from "./adapters/in/reminders.controller.js";
import { RemindersUseCases } from "./application/use-cases/reminders.use-cases.js";
import type { RemindersNotifierPort, RemindersSourcesPort } from "./domain/ports/out/reminders.ports.js";

/** Composition root do Novo RH → Avisos automáticos (FE-111). Fontes e notificações no server.ts. */
export function createRemindersModule(deps: { sources: RemindersSourcesPort; notifier: RemindersNotifierPort }): { router: Router; reminders: RemindersUseCases } {
  const reminders = new RemindersUseCases(deps.sources, deps.notifier);
  return { router: createRemindersRouter(reminders, new SupabaseIdempotencyStore(createScopedQuery)), reminders };
}
