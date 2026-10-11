import type { Request, Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { createTimeBaseRouter } from "./adapters/in/time-base.controller.js";
import { SupabaseTimeBaseRepository } from "./adapters/out/supabase-time-base.repository.js";
import { TimeBaseUseCases } from "./application/use-cases/time-base.use-cases.js";
import type { EmployeeTimeContextPort, NationalHolidaysPort, TimeAuditPort, TimeClockPort, TimeImpactPort } from "./domain/ports/out/time-base.ports.js";

/** Composition root do Novo RH → Tempo (Fase 3). Contexto do colaborador e feriados nacionais vêm de outros módulos. */
export function createTimeBaseModule(deps: {
  context: EmployeeTimeContextPort;
  impact: TimeImpactPort;
  national: NationalHolidaysPort;
  audit: TimeAuditPort;
  clock: TimeClockPort;
  canSeeEmployee: (req: Request, employeeId: string, date: string) => Promise<boolean>;
}): { router: Router; time: TimeBaseUseCases } {
  const time = new TimeBaseUseCases(new SupabaseTimeBaseRepository(createScopedQuery), deps.context, deps.impact, deps.national, deps.audit, deps.clock);
  return { router: createTimeBaseRouter(time, new SupabaseIdempotencyStore(createScopedQuery), deps.canSeeEmployee), time };
}
