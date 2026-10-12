import type { Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { createAnnouncementsRouter } from "./adapters/in/announcements.controller.js";
import { SupabaseAnnouncementsRepository } from "./adapters/out/supabase-announcements.repository.js";
import { AnnouncementsUseCases } from "./application/use-cases/announcements.use-cases.js";
import type { AnnouncementsContextPort } from "./domain/ports/out/announcements.ports.js";

/** Composition root do Novo RH → Comunicados (Fase 9). */
export function createAnnouncementsModule(deps: { context: AnnouncementsContextPort }): { router: Router; announcements: AnnouncementsUseCases } {
  const announcements = new AnnouncementsUseCases(new SupabaseAnnouncementsRepository(createScopedQuery), deps.context);
  return { router: createAnnouncementsRouter(announcements, new SupabaseIdempotencyStore(createScopedQuery)), announcements };
}
