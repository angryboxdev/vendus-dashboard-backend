import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CoverageRule, CoverageRuleInput } from "../../services/coverage.js";

/** Regras do Plano de Cobertura (mínimos por centro/área, dia da semana ou exceção datada). */
export interface CoverageRulesRepositoryPort {
  listCoverageRules(org: OrganizationId, locationId?: string | null): Promise<CoverageRule[]>;
  createCoverageRule(org: OrganizationId, r: CoverageRuleInput, by: string): Promise<CoverageRule>;
  updateCoverageRule(org: OrganizationId, id: string, patch: Partial<Pick<CoverageRule, "start" | "end" | "minPeople">>): Promise<CoverageRule>;
  deleteCoverageRule(org: OrganizationId, id: string): Promise<void>;
}

export interface CoverageContextPort {
  /** `time_tracking.roster.coverage_enabled` da empresa (desligado por omissão). */
  enabled(org: OrganizationId): Promise<boolean>;
  approvedAbsenceDates(org: OrganizationId, employeeId: string, from: string, to: string): Promise<string[]>;
}
