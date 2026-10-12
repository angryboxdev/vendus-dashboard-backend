import type { Request, Router } from "express";
import { log } from "../../infra/http/correlation.js";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../kernel/organization-id.js";
import { createAttendanceAdminRouter, createAttendanceMeRouter } from "./adapters/in/attendance.controller.js";
import { configFromSettings } from "./adapters/out/settings-config.js";
import { SupabaseAttendanceDirectory } from "./adapters/out/supabase-attendance-directory.js";
import { SupabaseAttendanceRepository } from "./adapters/out/supabase-attendance.repository.js";
import { AttendanceUseCases } from "./application/use-cases/attendance.use-cases.js";
import type { AttendanceAuditPort, AttendanceContextPort, PeriodGuardPort } from "./domain/ports/out/attendance.ports.js";
import type { DayPlan } from "./domain/services/day-engine.js";

/**
 * Composition root do Novo RH → Assiduidade (Fase 4). Parâmetros efetivos
 * (settings) e plano diário (time-base) vêm de outros módulos.
 */
export function createAttendanceModule(deps: {
  effectiveSettings: (org: OrganizationId, employeeId: string, date: string) => Promise<{ key: string; value: unknown }[]>;
  plans: (org: OrganizationId, employeeId: string, from: string, to: string) => Promise<Map<string, DayPlan>>;
  audit: AttendanceAuditPort;
  canSeeEmployee: (req: Request, employeeId: string, date: string) => Promise<boolean>;
  periods?: PeriodGuardPort;
  /** FE-113: níveis do fluxo "Correções de ponto" (módulo absences). Omisso = sem fluxo. */
  correctionLevels?: AttendanceContextPort["correctionLevels"];
}): { meRouter: Router; adminRouter: Router; attendance: AttendanceUseCases } {
  const directory = new SupabaseAttendanceDirectory(createScopedQuery);
  const attendance = new AttendanceUseCases(
    new SupabaseAttendanceRepository(createScopedQuery),
    {
      employeeForUser: (org, userId) => directory.employeeForUser(org, userId),
      correctionLevels: deps.correctionLevels ?? (async () => null),
      timeZone: (org) => directory.timeZone(org),
      punchLocation: (org, employeeId, locationId) => directory.punchLocation(org, employeeId, locationId),
      config: async (org, employeeId, date, tz) => configFromSettings(await deps.effectiveSettings(org, employeeId, date), tz),
      plans: deps.plans,
    },
    deps.audit,
    { now: () => new Date().toISOString() },
    {
      // Recálculo depois da resposta; uma falha fica no log e o próximo pedido volta a tentar.
      run: (task) =>
        setImmediate(() => {
          task().catch((e: unknown) => log("error", "attendance.recalculate_failed", { error: e instanceof Error ? e.message : String(e) }));
        }),
    },
    deps.periods,
  );
  const store = new SupabaseIdempotencyStore(createScopedQuery);
  return { meRouter: createAttendanceMeRouter(attendance, store), adminRouter: createAttendanceAdminRouter(attendance, store, deps.canSeeEmployee), attendance };
}
