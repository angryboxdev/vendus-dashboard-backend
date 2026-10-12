import type { Request, Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../kernel/organization-id.js";
import { createRostersRouter } from "./adapters/in/rosters.controller.js";
import { SupabaseRostersRepository } from "./adapters/out/supabase-rosters.repository.js";
import { RostersUseCases } from "./application/use-cases/rosters.use-cases.js";
import type { RosterPublishedPort, RostersAuditPort, RostersNotifierPort } from "./domain/ports/out/rosters.ports.js";
import type { Rules, Severity } from "./domain/services/constraints.js";

/** Parâmetros efetivos (legal + time_tracking.roster.*) → regras do motor de restrições. */
export function rulesFromSettings(values: { key: string; value: unknown }[]): Rules {
  const get = (k: string) => values.find((v) => v.key === k)?.value ?? null;
  const num = (k: string) => (typeof get(k) === "number" ? (get(k) as number) : null);
  const sev = (k: string): Severity => (get(k) === "block" ? "block" : "warning");
  return {
    minRestMinutes: num("legal.rest.min_minutes_between_workdays"),
    maxDailyMinutes: num("legal.hours.max_daily_minutes"),
    maxWeeklyMinutes: num("legal.hours.max_weekly_minutes"),
    maxAnnualHours: num("legal.hours.max_annual_hours"),
    restSeverity: sev("time_tracking.roster.rest_severity"),
    limitsSeverity: sev("time_tracking.roster.limits_severity"),
    absenceSeverity: sev("time_tracking.roster.absence_severity"),
  };
}

/** Composition root do Novo RH → Escalas (Fase 7). */
export function createRostersModule(deps: {
  effectiveSettings: (org: OrganizationId, employeeId: string, date: string) => Promise<{ key: string; value: unknown }[]>;
  approvedAbsenceDates: (org: OrganizationId, employeeId: string, from: string, to: string) => Promise<string[]>;
  employeeForUser: (org: OrganizationId, userId: string) => Promise<string | null>;
  userOfEmployee: (org: OrganizationId, employeeId: string) => Promise<string | null>;
  notifier: RostersNotifierPort;
  published: RosterPublishedPort;
  audit: RostersAuditPort;
  canSeeEmployee: (req: Request, employeeId: string, date: string) => Promise<boolean>;
}): { router: Router; rosters: RostersUseCases } {
  const rosters = new RostersUseCases(
    new SupabaseRostersRepository(createScopedQuery),
    {
      rules: async (org, employeeId, date) => rulesFromSettings(await deps.effectiveSettings(org, employeeId, date)),
      approvedAbsenceDates: deps.approvedAbsenceDates,
      employeeForUser: deps.employeeForUser,
      userOfEmployee: deps.userOfEmployee,
    },
    deps.notifier,
    deps.published,
    deps.audit,
  );
  return { router: createRostersRouter(rosters, new SupabaseIdempotencyStore(createScopedQuery), deps.canSeeEmployee), rosters };
}
