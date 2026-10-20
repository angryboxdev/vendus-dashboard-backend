import { DateTime } from "luxon";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { SettingData, SettingDomain } from "../../domain/entities/setting-definition.js";
import type { EmployeeSegments, ProfileKind, SettingProfile, SettingTarget, SettingValue } from "../../domain/entities/setting-profile.js";
import type { EmployeeSegmentsPort, SettingsClockPort, SettingsImpactPort, SettingsRepositoryPort } from "../../domain/ports/out/settings.ports.js";
import type { SettingsSnapshot } from "../../domain/services/setting-resolution.js";

interface ProfileRow {
  id: string;
  domain: SettingDomain;
  name: string;
  kind: ProfileKind;
  archived: boolean;
}
interface TargetRow {
  id: string;
  profile_id: string;
  target_type: SettingTarget["targetType"];
  target_id: string;
  valid_from: string;
  valid_to: string | null;
}
interface ValueRow {
  id: string;
  profile_id: string;
  key: string;
  value: SettingData | null;
  valid_from: string;
  reason: string;
  created_by: string;
  created_at: string;
}

const PROFILE_COLS = "id, domain, name, kind, archived";
const TARGET_COLS = "id, profile_id, target_type, target_id, valid_from, valid_to";
const VALUE_COLS = "id, profile_id, key, value, valid_from, reason, created_by, created_at";

const toProfile = (r: ProfileRow): SettingProfile => ({ id: r.id, domain: r.domain, name: r.name, kind: r.kind, archived: r.archived });
const toTarget = (r: TargetRow): SettingTarget => ({
  id: r.id,
  profileId: r.profile_id,
  targetType: r.target_type,
  targetId: r.target_id,
  validFrom: r.valid_from,
  validTo: r.valid_to,
});
const toValue = (r: ValueRow): SettingValue => ({
  id: r.id,
  profileId: r.profile_id,
  key: r.key,
  value: r.value,
  validFrom: r.valid_from,
  reason: r.reason,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Motor de configurações sobre Supabase. Carrega o retrato inteiro da organização — poucas centenas de linhas. */
export class SupabaseSettingsRepository implements SettingsRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async loadSnapshot(orgId: OrganizationId): Promise<SettingsSnapshot> {
    const q = this.scoped(orgId);
    const [p, t, v] = await Promise.all([
      q.table("setting_profiles").select(PROFILE_COLS).order("created_at"),
      q.table("setting_profile_targets").select(TARGET_COLS).order("created_at"),
      q.table("setting_values").select(VALUE_COLS).order("created_at"),
    ]);
    return {
      profiles: (check(p) as unknown as ProfileRow[]).map(toProfile),
      targets: (check(t) as unknown as TargetRow[]).map(toTarget),
      values: (check(v) as unknown as ValueRow[]).map(toValue),
    };
  }

  async createProfile(orgId: OrganizationId, input: { domain: SettingDomain; name: string; kind: ProfileKind; createdBy: string }): Promise<SettingProfile> {
    const res = await this.scoped(orgId)
      .table("setting_profiles")
      .insert({ domain: input.domain, name: input.name, kind: input.kind, created_by: input.createdBy })
      .select(PROFILE_COLS)
      .single();
    return toProfile(check(res) as unknown as ProfileRow);
  }

  async addTarget(orgId: OrganizationId, input: Omit<SettingTarget, "id"> & { createdBy: string }): Promise<SettingTarget> {
    const res = await this.scoped(orgId)
      .table("setting_profile_targets")
      .insert({
        profile_id: input.profileId,
        target_type: input.targetType,
        target_id: input.targetId,
        valid_from: input.validFrom,
        valid_to: input.validTo,
        created_by: input.createdBy,
      })
      .select(TARGET_COLS)
      .single();
    return toTarget(check(res) as unknown as TargetRow);
  }

  async appendValue(
    orgId: OrganizationId,
    input: { profileId: string; key: string; value: SettingData | null; validFrom: string; createdBy: string; reason: string },
  ): Promise<SettingValue> {
    const res = await this.scoped(orgId)
      .table("setting_values")
      .insert({
        profile_id: input.profileId,
        key: input.key,
        value: input.value,
        valid_from: input.validFrom,
        reason: input.reason,
        created_by: input.createdBy,
      })
      .select(VALUE_COLS)
      .single();
    return toValue(check(res) as unknown as ValueRow);
  }
}

/** Departamentos/grupos de um colaborador e membros de unidades — vem do módulo org-structure. */
export interface OrgUnitsLookup {
  unitsOf(orgId: OrganizationId, employeeId: string, date: string): Promise<{ departmentIds: string[]; groupIds: string[]; locationIds: string[] | null }>;
  membersOf(orgId: OrganizationId, unitType: "department" | "group", unitIds: string[], date: string): Promise<string[]>;
}

/** Validade da cache de centros por organização (ver `locationsOf`). */
const LOCATIONS_TTL_MS = 10_000;

/** Centros do colaborador = local principal + outros locais autorizados; departamentos/grupos da estrutura. */
export class SupabaseEmployeeSegments implements EmployeeSegmentsPort {
  constructor(
    private readonly scoped: ScopedQueryFactory,
    private readonly units: OrgUnitsLookup,
  ) {}

  /**
   * Centro principal e centros extra de todos os colaboradores da organização,
   * guardados ${LOCATIONS_TTL_MS / 1000} s (outros módulos escrevem nestas tabelas: TTL curto). Antes eram
   * duas leituras por colaborador × dia.
   */
  private readonly locationsCache = new Map<string, { at: number; value: Promise<{ primary: Map<string, string | null>; extra: Map<string, string[]> }> }>();
  private locationsOf(orgId: OrganizationId) {
    const hit = this.locationsCache.get(orgId);
    if (hit && Date.now() - hit.at < LOCATIONS_TTL_MS) return hit.value;
    // Por páginas de 1000 (limite do PostgREST), ordem estável.
    const all = async <T>(table: "hr_employees" | "hr_employee_locations", cols: string, order: string[]) => {
      const out: T[] = [];
      for (let from = 0; ; from += 1000) {
        let q = this.scoped(orgId).table(table).select(cols);
        for (const c of order) q = q.order(c);
        const rows = check(await q.range(from, from + 999)) as unknown as T[];
        out.push(...rows);
        if (rows.length < 1000) break;
      }
      return out;
    };
    const value = Promise.all([
      all<{ id: string; primary_location_id: string | null }>("hr_employees", "id, primary_location_id", ["id"]),
      all<{ employee_id: string; location_id: string }>("hr_employee_locations", "employee_id, location_id", ["employee_id", "location_id"]),
    ]).then(([emp, extra]) => {
      const primary = new Map(emp.map((r) => [r.id, r.primary_location_id]));
      const byEmployee = new Map<string, string[]>();
      for (const r of extra) byEmployee.set(r.employee_id, [...(byEmployee.get(r.employee_id) ?? []), r.location_id]);
      return { primary, extra: byEmployee };
    });
    this.locationsCache.set(orgId, { at: Date.now(), value });
    value.catch(() => this.locationsCache.delete(orgId));
    return value;
  }

  async segmentsOf(orgId: OrganizationId, employeeId: string, date: string): Promise<EmployeeSegments> {
    const [all, units] = await Promise.all([this.locationsOf(orgId), this.units.unitsOf(orgId, employeeId, date)]);
    const e = all.primary.has(employeeId) ? { primary_location_id: all.primary.get(employeeId) ?? null } : null;
    const locs = all.extra.get(employeeId) ?? [];
    const { departmentIds, groupIds, locationIds: dated } = units;
    // Com histórico de centros (transferências) vale o centro dessa data; senão o principal atual.
    const main = dated ?? (e?.primary_location_id ? [e.primary_location_id] : []);
    const locationIds = [...new Set([...main, ...locs])];
    return { employeeId, locationIds, departmentIds, groupIds };
  }
}

/** Colaboradores ativos abrangidos (pré-visualização de impacto). */
export class SupabaseSettingsImpact implements SettingsImpactPort {
  constructor(
    private readonly scoped: ScopedQueryFactory,
    private readonly units: OrgUnitsLookup,
  ) {}

  async countEmployees(orgId: OrganizationId, scope: { allEmployees: true } | { targets: Pick<SettingTarget, "targetType" | "targetId">[] }, date: string): Promise<number> {
    const q = this.scoped(orgId);
    const active = await q.table("hr_employees").select("id, primary_location_id").eq("status", "active");
    const employees = check(active) as unknown as { id: string; primary_location_id: string | null }[];
    if ("allEmployees" in scope) return employees.length;
    const ids = new Set<string>();
    const activeIds = new Set(employees.map((e) => e.id));
    const locationIds = scope.targets.filter((t) => t.targetType === "location").map((t) => t.targetId);
    for (const t of scope.targets) if (t.targetType === "employee" && activeIds.has(t.targetId)) ids.add(t.targetId);
    if (locationIds.length) {
      for (const e of employees) if (e.primary_location_id && locationIds.includes(e.primary_location_id)) ids.add(e.id);
      const extra = await q.table("hr_employee_locations").select("employee_id").in("location_id", locationIds);
      for (const r of check(extra) as unknown as { employee_id: string }[]) if (activeIds.has(r.employee_id)) ids.add(r.employee_id);
    }
    for (const unitType of ["department", "group"] as const) {
      const unitIds = scope.targets.filter((t) => t.targetType === unitType).map((t) => t.targetId);
      for (const id of await this.units.membersOf(orgId, unitType, unitIds, date)) if (activeIds.has(id)) ids.add(id);
    }
    return ids.size;
  }
}

/** "Hoje" no fuso da organização (organizations.timezone). */
export class OrganizationTimezoneClock implements SettingsClockPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async today(orgId: OrganizationId): Promise<string> {
    const res = await this.scoped(orgId).table("organizations").select("timezone").maybeSingle();
    const tz = (check(res) as unknown as { timezone: string | null } | null)?.timezone || "Europe/Lisbon";
    return DateTime.now().setZone(tz).toISODate()!;
  }
}
