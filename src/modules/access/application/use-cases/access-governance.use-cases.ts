import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { AccessNotFoundError, AccessValidationError } from "../../domain/errors.js";
import { FIELD_PRIVACY_CATALOG, fieldAccess, type FieldRule } from "../../domain/field-privacy.js";
import type { AccessAdminRepositoryPort, AccessAuditPort } from "../../domain/ports/out/access-admin.port.js";
import type { AccessGovernanceRepositoryPort, EmployeeUnitsPort, RoleHistoryEntry } from "../../domain/ports/out/access-governance.port.js";
import { coversEmployee, scopeOverlaps, type AccessScope, type ScopeKind, type ScopeType } from "../../domain/services/scope.service.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SCOPE_TYPES: ScopeType[] = ["location", "department", "group", "self"];

export interface FieldPrivacyView {
  key: string;
  label: string;
  group: string;
  sensitive: boolean;
  view: boolean;
  edit: boolean;
  /** Regra própria do perfil (false = vale a regra por omissão). */
  customized: boolean;
}

/**
 * Novo RH, Fase 1 ticket 05 — tipo de perfil (Geral/Específico), âmbitos
 * com vigência, privacidade por campo, histórico de papéis e a verificação
 * "este utilizador gere este colaborador?" usada pelos módulos do Novo RH.
 */
export class AccessGovernanceUseCases {
  constructor(
    private readonly repo: AccessGovernanceRepositoryPort,
    private readonly admin: Pick<AccessAdminRepositoryPort, "listMembers" | "findProfileById">,
    private readonly units: EmployeeUnitsPort,
    private readonly audit: AccessAuditPort,
  ) {}

  async profileGovernance(org: OrganizationId, profileId: string): Promise<{ scopeKind: ScopeKind; fields: FieldPrivacyView[] }> {
    const profile = await this.admin.findProfileById(org, profileId);
    if (!profile) throw new AccessNotFoundError("Perfil");
    const [scopeKind, rules] = await Promise.all([this.repo.getProfileScopeKind(org, profileId), this.repo.listFieldRules(org, profileId)]);
    const isAdmin = profile.systemKey === "admin";
    return {
      scopeKind: scopeKind ?? "general",
      fields: FIELD_PRIVACY_CATALOG.map((f) => ({
        key: f.key,
        label: f.label,
        group: f.group,
        sensitive: f.sensitive,
        ...fieldAccess(isAdmin, rules, f.key),
        customized: rules.some((r) => r.fieldKey === f.key),
      })),
    };
  }

  async setScopeKind(org: OrganizationId, profileId: string, kind: ScopeKind, actor: string): Promise<void> {
    if (kind !== "general" && kind !== "specific") throw new AccessValidationError("Tipo de perfil inválido");
    const profile = await this.admin.findProfileById(org, profileId);
    if (!profile) throw new AccessNotFoundError("Perfil");
    if (profile.systemKey === "admin" && kind === "specific") throw new AccessValidationError("O perfil Admin gere sempre toda a empresa");
    const before = (await this.repo.getProfileScopeKind(org, profileId)) ?? "general";
    if (before === kind) return;
    await this.repo.setProfileScopeKind(org, profileId, kind);
    await this.audit.record({ organizationId: org, actor, entityType: "access_profile", entityId: profileId, action: "scope_kind_changed", before: { scopeKind: before }, after: { scopeKind: kind } });
  }

  async setFieldPrivacy(org: OrganizationId, profileId: string, rules: FieldRule[], actor: string): Promise<void> {
    const profile = await this.admin.findProfileById(org, profileId);
    if (!profile) throw new AccessNotFoundError("Perfil");
    if (profile.systemKey === "admin") throw new AccessValidationError("O Admin vê e edita sempre todos os campos");
    const known = new Set(FIELD_PRIVACY_CATALOG.map((f) => f.key));
    for (const r of rules) {
      if (!known.has(r.fieldKey)) throw new AccessValidationError(`Campo desconhecido: ${r.fieldKey}`);
      if (r.canEdit && !r.canView) throw new AccessValidationError("Só pode editar um campo que também pode ver");
    }
    const before = await this.repo.listFieldRules(org, profileId);
    await this.repo.upsertFieldRules(org, profileId, rules, actor);
    await this.audit.record({ organizationId: org, actor, entityType: "access_profile", entityId: profileId, action: "field_privacy_changed", before, after: rules });
  }

  async listScopes(org: OrganizationId, userId: string): Promise<AccessScope[]> {
    return this.repo.listScopes(org, userId);
  }

  async addScope(org: OrganizationId, userId: string, input: { scopeType: ScopeType; scopeId: string | null; validFrom: string; validTo: string | null }, actor: string) {
    if (!(await this.admin.listMembers(org)).some((m) => m.userId === userId)) throw new AccessNotFoundError("Utilizador");
    if (!SCOPE_TYPES.includes(input.scopeType)) throw new AccessValidationError("Tipo de âmbito inválido");
    const scopeId = input.scopeType === "self" ? null : input.scopeId;
    if (input.scopeType !== "self" && !scopeId) throw new AccessValidationError("Escolha o centro, departamento ou grupo");
    if (!DATE.test(input.validFrom) || (input.validTo !== null && (!DATE.test(input.validTo) || input.validTo < input.validFrom))) {
      throw new AccessValidationError("Vigência inválida");
    }
    const next = { userId, scopeType: input.scopeType, scopeId, validFrom: input.validFrom, validTo: input.validTo };
    if (scopeOverlaps(await this.repo.listScopes(org, userId), next)) throw new AccessValidationError("Este âmbito já existe nesse período");
    const scope = await this.repo.insertScope(org, { ...next, createdBy: actor });
    await this.audit.record({ organizationId: org, actor, entityType: "user", entityId: userId, action: "scope_added", after: scope });
    return scope;
  }

  async endScope(org: OrganizationId, userId: string, scopeId: string, validTo: string, actor: string) {
    const cur = (await this.repo.listScopes(org, userId)).find((s) => s.id === scopeId);
    if (!cur) throw new AccessNotFoundError("Âmbito");
    if (!DATE.test(validTo) || validTo < cur.validFrom || (cur.validTo !== null && validTo > cur.validTo)) throw new AccessValidationError("Só pode encurtar a vigência");
    const ended = await this.repo.endScope(org, scopeId, validTo);
    await this.audit.record({ organizationId: org, actor, entityType: "user", entityId: userId, action: "scope_ended", before: cur, after: ended });
    return ended;
  }

  async roleHistory(org: OrganizationId, filter: { from?: string; to?: string; limit?: number }): Promise<RoleHistoryEntry[]> {
    if ((filter.from && !DATE.test(filter.from)) || (filter.to && !DATE.test(filter.to))) throw new AccessValidationError("Datas inválidas");
    return this.repo.roleHistory(org, { ...filter, limit: Math.min(Math.max(filter.limit ?? 500, 1), 5000) });
  }

  /** RE-34 / âmbito: o utilizador gere este colaborador nesta data? */
  async canManageEmployee(org: OrganizationId, who: { userId: string; isAdmin: boolean; profileId: string | null }, employeeId: string, date: string): Promise<boolean> {
    if (who.isAdmin) return true;
    const scopeKind = who.profileId ? ((await this.repo.getProfileScopeKind(org, who.profileId)) ?? "general") : "general";
    if (scopeKind === "general") return true;
    const [scopes, ownEmployeeId, units] = await Promise.all([
      this.repo.listScopes(org, who.userId),
      this.units.employeeOfUser(org, who.userId),
      this.units.unitsOf(org, employeeId, date),
    ]);
    return coversEmployee({ isAdmin: false, scopeKind, scopes, ownEmployeeId }, units, date);
  }
}
