import type { Request, Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { SettingsController } from "./adapters/in/settings.controller.js";
import {
  OrganizationTimezoneClock,
  SupabaseEmployeeSegments,
  SupabaseSettingsImpact,
  SupabaseSettingsRepository,
} from "./adapters/out/supabase-settings.adapters.js";
import { SettingsUseCases } from "./application/use-cases/settings.use-cases.js";
import type { Actor, SettingsPorts } from "./domain/ports/in/settings.ports.js";
import type { SettingsAuditPort } from "./domain/ports/out/settings.ports.js";
import { SETTING_CATALOG } from "./domain/services/setting-catalog.js";

/**
 * Composition root do motor de configurações (Novo RH, Fase 1).
 * `canRetroactive` vem de fora (módulo access) para este módulo não
 * depender do modelo de permissões.
 */
export function createSettingsModule(deps: { canRetroactive: (req: Request) => boolean; audit: SettingsAuditPort }): { router: Router; settings: SettingsPorts } {
  const settings = new SettingsUseCases(
    new SupabaseSettingsRepository(createScopedQuery),
    new SupabaseEmployeeSegments(createScopedQuery),
    new SupabaseSettingsImpact(createScopedQuery),
    new OrganizationTimezoneClock(createScopedQuery),
    SETTING_CATALOG,
    deps.audit,
  );
  const actorOf = (req: Request): Actor => ({ userId: req.auth!.email || req.auth!.sub, canRetroactive: deps.canRetroactive(req) });
  const controller = new SettingsController(settings, new SupabaseIdempotencyStore(createScopedQuery), actorOf);
  return { router: controller.router, settings };
}
