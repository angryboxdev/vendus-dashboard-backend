import type { Request, Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../kernel/organization-id.js";
import { createTimeBankRouter } from "./adapters/in/time-bank.controller.js";
import { bankSettingsFrom } from "./adapters/out/settings-bank.js";
import { SupabaseTimeBankRepository } from "./adapters/out/supabase-time-bank.repository.js";
import { TimeBankUseCases } from "./application/use-cases/time-bank.use-cases.js";
import type { PeriodGuardPort, TimeBankAuditPort } from "./domain/ports/out/time-bank.ports.js";
import type { BankDay } from "./domain/services/posting.js";

/** Composition root do Novo RH → Banco de horas (Fase 6). Dias vêm da assiduidade, regras do settings. */
export function createTimeBankModule(deps: {
  attendanceDays: (org: OrganizationId, employeeId: string, from: string, to: string) => Promise<{ timeZone: string; days: BankDay[] }>;
  effectiveSettings: (org: OrganizationId, employeeId: string, date: string) => Promise<{ key: string; value: unknown }[]>;
  holidayOn: (org: OrganizationId, employeeId: string, date: string) => Promise<{ coefficient: number } | null>;
  employeeForUser: (org: OrganizationId, userId: string) => Promise<string | null>;
  today: (org: OrganizationId) => Promise<string>;
  audit: TimeBankAuditPort;
  canSeeEmployee: (req: Request, employeeId: string, date: string) => Promise<boolean>;
  periods?: PeriodGuardPort;
  /** Colaboradores ativos (lista de saldos, FE-034). */
  directory?: (org: OrganizationId) => Promise<{ id: string; name: string; locationName: string | null }[]>;
}): { router: Router; timeBank: TimeBankUseCases } {
  const timeBank = new TimeBankUseCases(
    new SupabaseTimeBankRepository(createScopedQuery),
    {
      attendanceDays: deps.attendanceDays,
      settingsAt: async (org, employeeId, date) => bankSettingsFrom(await deps.effectiveSettings(org, employeeId, date)),
      holidayOn: deps.holidayOn,
      employeeForUser: deps.employeeForUser,
      today: deps.today,
    },
    deps.audit,
    deps.periods,
  );
  return { router: createTimeBankRouter(timeBank, new SupabaseIdempotencyStore(createScopedQuery), deps.canSeeEmployee, deps.directory), timeBank };
}
