import type { Request, Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../kernel/organization-id.js";
import { createAbsencesAdminRouter, createAbsencesMeRouter } from "./adapters/in/absences.controller.js";
import { coverage, SupabaseAbsencesDirectory } from "./adapters/out/supabase-absences-directory.js";
import { SupabaseAbsencesRepository } from "./adapters/out/supabase-absences.repository.js";
import { AbsencesUseCases } from "./application/use-cases/absences.use-cases.js";
import type { VacationRules } from "./domain/entities/absence-type.js";
import type { AbsencesAuditPort, AbsencesNotifierPort } from "./domain/ports/out/absences.ports.js";
import type { PlanDay } from "./domain/services/absence-calc.js";

/**
 * Composition root do Novo RH → Ausências (Fase 5). Contratos e responsáveis
 * (people), plano diário e calendários (time-base), horas trabalhadas
 * (attendance) e notificações chegam por funções do servidor.
 */
export function createAbsencesModule(deps: {
  contracts: (org: OrganizationId, employeeId: string) => Promise<{ startDate: string; endDate: string | null; seniorityDate: string | null; status: string }[]>;
  managers: (org: OrganizationId, employeeId: string) => Promise<{ managerEmployeeId: string; kind: string; validFrom: string; validTo: string | null }[]>;
  planDays: (org: OrganizationId, employeeId: string, from: string, to: string) => Promise<PlanDay[]>;
  vacationRulesFor: (org: OrganizationId, employeeId: string, date: string) => Promise<VacationRules | null>;
  holidayOn: (org: OrganizationId, employeeId: string, date: string) => Promise<{ name: string; coefficient: number; approvalRequired: boolean } | null>;
  workedSeconds: (org: OrganizationId, employeeId: string, date: string) => Promise<number>;
  adminUserIds: (org: OrganizationId) => Promise<string[]>;
  today: (org: OrganizationId) => Promise<string>;
  notifier: AbsencesNotifierPort;
  audit: AbsencesAuditPort;
  canSeeEmployee: (req: Request, employeeId: string, date: string) => Promise<boolean>;
  canPrivate: (req: Request) => boolean;
}): { adminRouter: Router; meRouter: Router; absences: AbsencesUseCases } {
  const dir = new SupabaseAbsencesDirectory(createScopedQuery);
  const absences = new AbsencesUseCases(
    new SupabaseAbsencesRepository(createScopedQuery),
    {
      employeeForUser: (org, userId) => dir.employeeForUser(org, userId),
      userOfEmployee: (org, employeeId) => dir.userOfEmployee(org, employeeId),
      contractCoverage: async (org, employeeId, from, to) => coverage(await deps.contracts(org, employeeId), from, to),
      planDays: deps.planDays,
      vacationRulesFor: deps.vacationRulesFor,
      // Responsáveis diretos e aprovadores de ausências em vigor nessa data.
      managerUserIds: async (org, employeeId, date) => {
        const links = (await deps.managers(org, employeeId)).filter((m) => (m.kind === "direct" || m.kind === "approver_leave") && m.validFrom <= date && (m.validTo === null || date <= m.validTo));
        return dir.usersOfEmployees(org, links.map((m) => m.managerEmployeeId));
      },
      profileUserIds: (org, profileId) => dir.profileUserIds(org, profileId),
      adminUserIds: deps.adminUserIds,
      holidayOn: deps.holidayOn,
      workedSeconds: deps.workedSeconds,
    },
    deps.notifier,
    deps.audit,
    { today: deps.today },
  );
  const store = new SupabaseIdempotencyStore(createScopedQuery);
  return {
    adminRouter: createAbsencesAdminRouter(absences, store, { canSeeEmployee: deps.canSeeEmployee, canPrivate: deps.canPrivate }),
    meRouter: createAbsencesMeRouter(absences, store, { canPrivate: deps.canPrivate }),
    absences,
  };
}
