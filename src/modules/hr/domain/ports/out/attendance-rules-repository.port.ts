import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { AttendanceRulesVersion } from "../../entities/attendance-rules.js";

/**
 * Fase 2.1 — cada linha é uma versão completa (nunca UPDATE). `listVersions`
 * devolve todas, ordem indiferente (quem consome ordena conforme precisa:
 * `resolveEffectiveRules` para a vigente, `ListAttendanceRuleChangesUseCase`
 * para o histórico por campo).
 */
export interface AttendanceRulesRepositoryPort {
  listVersions(organizationId: OrganizationId): Promise<AttendanceRulesVersion[]>;
  save(organizationId: OrganizationId, version: AttendanceRulesVersion): Promise<AttendanceRulesVersion>;
}
