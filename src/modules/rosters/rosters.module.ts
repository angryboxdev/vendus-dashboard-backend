import type { Request, Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../kernel/organization-id.js";
import { createRostersRouter } from "./adapters/in/rosters.controller.js";
import { SupabaseCoverageRulesRepository } from "./adapters/out/supabase-coverage-rules.repository.js";
import { SupabaseRostersRepository } from "./adapters/out/supabase-rosters.repository.js";
import { CoverageUseCases } from "./application/use-cases/coverage.use-cases.js";
import { RostersUseCases } from "./application/use-cases/rosters.use-cases.js";
import type { PeriodGuardPort, RosterPublishedPort, RostersAuditPort, RostersNotifierPort } from "./domain/ports/out/rosters.ports.js";
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
  periods?: PeriodGuardPort;
  /** Parâmetros de segurança efetivos (visibilidade no Portal); sem eles, colegas nunca visíveis. */
  securitySettings?: (org: OrganizationId, employeeId: string, date: string) => Promise<{ key: string; value: unknown }[]>;
  locationNames?: (org: OrganizationId) => Promise<Map<string, string>>;
  peopleBrief?: (org: OrganizationId, employeeIds: string[]) => Promise<{ id: string; fullName: string; positionName: string | null; active: boolean }[]>;
  /** Quem pertence ao centro/grupo da escala (seletor de colaboradores); sem ele, ninguém é «do centro». */
  targetMembers?: (org: OrganizationId, targetType: "location" | "group", targetId: string, date: string) => Promise<string[]>;
  /** Plano de Cobertura ligado na empresa (`time_tracking.roster.coverage_enabled`); sem ele, desligado. */
  coverageEnabled?: (org: OrganizationId) => Promise<boolean>;
  /** Ligar/desligar o Plano de Cobertura a partir das Escalas. */
  setCoverageEnabled?: (org: OrganizationId, userId: string, enabled: boolean) => Promise<void>;
}): { router: Router; rosters: RostersUseCases; coverage: CoverageUseCases } {
  const repo = new SupabaseRostersRepository(createScopedQuery);
  const rosters = new RostersUseCases(
    repo,
    {
      rules: async (org, employeeId, date) => rulesFromSettings(await deps.effectiveSettings(org, employeeId, date)),
      approvedAbsenceDates: deps.approvedAbsenceDates,
      employeeForUser: deps.employeeForUser,
      userOfEmployee: deps.userOfEmployee,
      coworkersVisible: async (org, employeeId, date) =>
        deps.securitySettings ? (await deps.securitySettings(org, employeeId, date)).find((v) => v.key === "security.visibility.coworkers_shifts")?.value === true : false,
      peopleBrief: async (org, ids) => (deps.peopleBrief && ids.length ? deps.peopleBrief(org, ids) : []),
      targetMembers: async (org, targetType, targetId, date) => (deps.targetMembers ? deps.targetMembers(org, targetType, targetId, date) : []),
      locationNames: async (org) => (deps.locationNames ? deps.locationNames(org) : new Map()),
    },
    deps.notifier,
    deps.published,
    deps.audit,
    deps.periods,
  );
  const coverage = new CoverageUseCases(
    new SupabaseCoverageRulesRepository(createScopedQuery),
    repo,
    {
      enabled: async (org) => (deps.coverageEnabled ? deps.coverageEnabled(org) : false),
      setEnabled: async (org, userId, enabled) => {
        if (!deps.setCoverageEnabled) throw new Error("Plano de Cobertura sem ligação às configurações.");
        await deps.setCoverageEnabled(org, userId, enabled);
      },
      approvedAbsenceDates: deps.approvedAbsenceDates,
    },
    deps.audit,
  );
  return { router: createRostersRouter(rosters, new SupabaseIdempotencyStore(createScopedQuery), deps.canSeeEmployee, coverage), rosters, coverage };
}
