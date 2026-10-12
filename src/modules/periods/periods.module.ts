import { randomBytes } from "node:crypto";
import type { Request, Router } from "express";
import { log } from "../../infra/http/correlation.js";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { createPeriodsRouter } from "./adapters/in/periods.controller.js";
import { locationName, SupabasePeriodsRepository } from "./adapters/out/supabase-periods.repository.js";
import { PeriodsUseCases } from "./application/use-cases/periods.use-cases.js";
import type { PeriodsAuditPort, PeriodsContextPort } from "./domain/ports/out/periods.ports.js";

/** Composition root do Novo RH → Períodos (Fase 8). Totais e pendentes vêm dos outros módulos. */
export function createPeriodsModule(deps: {
  context: Omit<PeriodsContextPort, "locationName">;
  audit: PeriodsAuditPort;
  canSensitive: (req: Request) => boolean;
}): { router: Router; periods: PeriodsUseCases } {
  const periods = new PeriodsUseCases(
    new SupabasePeriodsRepository(createScopedQuery),
    { ...deps.context, locationName: (org, id) => locationName(createScopedQuery, org, id) },
    {
      token: () => randomBytes(24).toString("base64url"),
      now: () => new Date().toISOString(),
      background: (task) =>
        setImmediate(() => {
          task().catch((e: unknown) => log("error", "periods.export_failed", { error: e instanceof Error ? e.message : String(e) }));
        }),
    },
    deps.audit,
  );
  return { router: createPeriodsRouter(periods, new SupabaseIdempotencyStore(createScopedQuery), deps.canSensitive), periods };
}
