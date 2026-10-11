import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { FieldRule } from "../../domain/field-privacy.js";
import type { AccessGovernanceRepositoryPort, EmployeeUnitsPort, RoleHistoryEntry } from "../../domain/ports/out/access-governance.port.js";
import type { AccessScope, EmployeeUnits, ScopeKind } from "../../domain/services/scope.service.js";

type Res = { data: unknown; error: { message: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

interface ScopeRow {
  id: string;
  user_id: string;
  scope_type: AccessScope["scopeType"];
  scope_id: string | null;
  valid_from: string;
  valid_to: string | null;
}
const SCOPE = "id, user_id, scope_type, scope_id, valid_from, valid_to";
const toScope = (r: ScopeRow): AccessScope => ({ id: r.id, userId: r.user_id, scopeType: r.scope_type, scopeId: r.scope_id, validFrom: r.valid_from, validTo: r.valid_to });

export class SupabaseAccessGovernanceRepository implements AccessGovernanceRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async getProfileScopeKind(org: OrganizationId, profileId: string): Promise<ScopeKind | null> {
    const row = check<{ scope_kind: ScopeKind } | null>(await this.scoped(org).table("access_profiles").select("scope_kind").eq("id", profileId).maybeSingle());
    return row?.scope_kind ?? null;
  }
  async setProfileScopeKind(org: OrganizationId, profileId: string, kind: ScopeKind): Promise<void> {
    check(await this.scoped(org).table("access_profiles").update({ scope_kind: kind, updated_at: new Date().toISOString() }).eq("id", profileId));
  }
  async listScopes(org: OrganizationId, userId: string): Promise<AccessScope[]> {
    return check<ScopeRow[]>(await this.scoped(org).table("access_scopes").select(SCOPE).eq("user_id", userId).order("valid_from")).map(toScope);
  }
  async insertScope(org: OrganizationId, s: Omit<AccessScope, "id"> & { createdBy: string }): Promise<AccessScope> {
    const row = { user_id: s.userId, scope_type: s.scopeType, scope_id: s.scopeId, valid_from: s.validFrom, valid_to: s.validTo, created_by: s.createdBy };
    return toScope(check<ScopeRow>(await this.scoped(org).table("access_scopes").insert(row).select(SCOPE).single()));
  }
  async endScope(org: OrganizationId, id: string, validTo: string): Promise<AccessScope> {
    return toScope(check<ScopeRow>(await this.scoped(org).table("access_scopes").update({ valid_to: validTo }).eq("id", id).select(SCOPE).single()));
  }
  async listFieldRules(org: OrganizationId, profileId: string): Promise<FieldRule[]> {
    const rows = check<{ field_key: string; can_view: boolean; can_edit: boolean }[]>(
      await this.scoped(org).table("access_field_privacy").select("field_key, can_view, can_edit").eq("profile_id", profileId),
    );
    return rows.map((r) => ({ fieldKey: r.field_key, canView: r.can_view, canEdit: r.can_edit }));
  }
  async upsertFieldRules(org: OrganizationId, profileId: string, rules: FieldRule[], updatedBy: string): Promise<void> {
    if (rules.length === 0) return;
    const now = new Date().toISOString();
    const rows = rules.map((r) => ({ profile_id: profileId, field_key: r.fieldKey, can_view: r.canView, can_edit: r.canEdit, updated_by: updatedBy, updated_at: now }));
    check(await this.scoped(org).table("access_field_privacy").upsert(rows, { onConflict: "org_id,profile_id,field_key" }));
  }
  async roleHistory(org: OrganizationId, filter: { from?: string; to?: string; limit: number }): Promise<RoleHistoryEntry[]> {
    let q = this.scoped(org).table("organization_audit_logs").select("created_at, actor, entity_type, entity_id, action, payload_before, payload_after").in("entity_type", ["user", "access_profile"]);
    if (filter.from) q = q.gte("created_at", `${filter.from}T00:00:00Z`);
    if (filter.to) q = q.lte("created_at", `${filter.to}T23:59:59.999Z`);
    const rows = check<{ created_at: string; actor: string; entity_type: string; entity_id: string; action: string; payload_before: unknown; payload_after: unknown }[]>(
      await q.order("created_at", { ascending: false }).limit(filter.limit),
    );
    return rows.map((r) => ({ at: r.created_at, actor: r.actor, entityType: r.entity_type, entityId: r.entity_id, action: r.action, before: r.payload_before, after: r.payload_after }));
  }
}

/** Locais do colaborador (principal + autorizados); departamentos/grupos vêm da estrutura. */
export class SupabaseEmployeeUnits implements EmployeeUnitsPort {
  constructor(
    private readonly scoped: ScopedQueryFactory,
    private readonly orgUnits: (org: OrganizationId, employeeId: string, date: string) => Promise<{ departmentIds: string[]; groupIds: string[]; locationIds?: string[] | null }>,
  ) {}

  async unitsOf(org: OrganizationId, employeeId: string, date: string): Promise<EmployeeUnits> {
    const q = this.scoped(org);
    const [emp, extra, units] = await Promise.all([
      q.table("hr_employees").select("primary_location_id").eq("id", employeeId).maybeSingle(),
      q.table("hr_employee_locations").select("location_id").eq("employee_id", employeeId),
      this.orgUnits(org, employeeId, date),
    ]);
    const primary = check<{ primary_location_id: string | null } | null>(emp)?.primary_location_id;
    const locs = check<{ location_id: string }[]>(extra).map((r) => r.location_id);
    const main = units.locationIds ?? (primary ? [primary] : []);
    return { employeeId, locationIds: [...new Set([...main, ...locs])], departmentIds: units.departmentIds, groupIds: units.groupIds };
  }

  async employeeOfUser(org: OrganizationId, userId: string): Promise<string | null> {
    return check<{ id: string } | null>(await this.scoped(org).table("hr_employees").select("id").eq("user_id", userId).maybeSingle())?.id ?? null;
  }
}
