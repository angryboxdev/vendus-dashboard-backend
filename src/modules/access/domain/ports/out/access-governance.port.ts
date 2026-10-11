import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { FieldRule } from "../../field-privacy.js";
import type { AccessScope, EmployeeUnits, ScopeKind } from "../../services/scope.service.js";

export interface RoleHistoryEntry {
  at: string;
  actor: string;
  entityType: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
}

/** Tipo de perfil, âmbitos, privacidade por campo e histórico de papéis. */
export interface AccessGovernanceRepositoryPort {
  getProfileScopeKind(org: OrganizationId, profileId: string): Promise<ScopeKind | null>;
  setProfileScopeKind(org: OrganizationId, profileId: string, kind: ScopeKind): Promise<void>;
  listScopes(org: OrganizationId, userId: string): Promise<AccessScope[]>;
  insertScope(org: OrganizationId, scope: Omit<AccessScope, "id"> & { createdBy: string }): Promise<AccessScope>;
  endScope(org: OrganizationId, id: string, validTo: string): Promise<AccessScope>;
  listFieldRules(org: OrganizationId, profileId: string): Promise<FieldRule[]>;
  upsertFieldRules(org: OrganizationId, profileId: string, rules: FieldRule[], updatedBy: string): Promise<void>;
  roleHistory(org: OrganizationId, filter: { from?: string; to?: string; limit: number }): Promise<RoleHistoryEntry[]>;
}

/** Onde está um colaborador numa data, e a ficha de um utilizador. */
export interface EmployeeUnitsPort {
  unitsOf(org: OrganizationId, employeeId: string, date: string): Promise<EmployeeUnits>;
  employeeOfUser(org: OrganizationId, userId: string): Promise<string | null>;
}
