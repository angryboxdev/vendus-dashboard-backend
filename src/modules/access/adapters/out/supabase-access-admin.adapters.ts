import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { authAdmin } from "../../../../infra/scoped-db/auth-admin.js";
import type { SystemProfileKey } from "../../domain/catalog.js";
import { AccessValidationError } from "../../domain/errors.js";
import type {
  AccessAdminRepositoryPort,
  AccessAuditPort,
  AccountDirectoryPort,
  AccountInfo,
  EmployeeLink,
  EmployeeLinkPort,
  MemberPatch,
  NewProfileInput,
  ProfilePatch,
} from "../../domain/ports/out/access-admin.port.js";
import type { AccessMemberRecord, AccessProfileRecord } from "../../domain/ports/out/access-repository.port.js";
import { sanitizePermissionMap } from "../../domain/services/effective-access.service.js";
import { PROFILE_COLUMNS, toProfileRecord, type ProfileRow } from "./supabase-access.repository.js";

interface MemberRow {
  user_id: string;
  role: string;
  profile_id: string | null;
  permission_overrides: Record<string, unknown> | null;
  status: "active" | "disabled";
  version: number;
}

const toMember = (r: MemberRow): AccessMemberRecord => ({
  userId: r.user_id,
  legacyRole: r.role,
  profileId: r.profile_id,
  overrides: sanitizePermissionMap(r.permission_overrides ?? {}),
  status: r.status,
  version: r.version,
});

/** Perfis e memberships — sempre pelo scoped query; `version` incrementado em cada escrita (concorrência otimista). */
export class SupabaseAccessAdminRepository implements AccessAdminRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async listMembers(org: OrganizationId): Promise<AccessMemberRecord[]> {
    const { data, error } = await this.scopedQuery(org).table("org_members").select("user_id, role, profile_id, permission_overrides, status, version");
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as MemberRow[]).map(toMember);
  }

  async listProfiles(org: OrganizationId): Promise<AccessProfileRecord[]> {
    const { data, error } = await this.scopedQuery(org).table("access_profiles").select(PROFILE_COLUMNS);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as ProfileRow[]).map(toProfileRecord);
  }

  async findProfileById(org: OrganizationId, id: string): Promise<AccessProfileRecord | null> {
    const { data, error } = await this.scopedQuery(org).table("access_profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toProfileRecord(data as unknown as ProfileRow) : null;
  }

  async findSystemProfile(org: OrganizationId, key: SystemProfileKey): Promise<AccessProfileRecord | null> {
    const { data, error } = await this.scopedQuery(org).table("access_profiles").select(PROFILE_COLUMNS).eq("system_key", key).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toProfileRecord(data as unknown as ProfileRow) : null;
  }

  async insertProfile(org: OrganizationId, input: NewProfileInput): Promise<AccessProfileRecord> {
    const { data, error } = await this.scopedQuery(org)
      .table("access_profiles")
      .insert({ name: input.name, description: input.description, permissions: input.permissions, created_by: input.createdBy })
      .select(PROFILE_COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") throw new AccessValidationError("Já existe um perfil com esse nome");
      throw new Error(error.message);
    }
    return toProfileRecord(data as unknown as ProfileRow);
  }

  async updateProfile(org: OrganizationId, id: string, patch: ProfilePatch, expectedVersion: number): Promise<AccessProfileRecord | null> {
    const { data, error } = await this.scopedQuery(org)
      .table("access_profiles")
      .update({ ...patch, version: expectedVersion + 1, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("version", expectedVersion)
      .select(PROFILE_COLUMNS)
      .maybeSingle();
    if (error) {
      if (error.code === "23505") throw new AccessValidationError("Já existe um perfil com esse nome");
      throw new Error(error.message);
    }
    return data ? toProfileRecord(data as unknown as ProfileRow) : null;
  }

  async insertMember(org: OrganizationId, userId: string, profileId: string, legacyRole: string): Promise<void> {
    const { error } = await this.scopedQuery(org).table("org_members").insert({ user_id: userId, role: legacyRole, profile_id: profileId });
    if (error) throw new Error(error.message);
  }

  async updateMember(org: OrganizationId, userId: string, patch: MemberPatch, expectedVersion: number): Promise<boolean> {
    const row: Record<string, unknown> = { version: expectedVersion + 1, updated_at: new Date().toISOString() };
    if (patch.profileId !== undefined) row.profile_id = patch.profileId;
    if (patch.legacyRole !== undefined) row.role = patch.legacyRole;
    if (patch.overrides !== undefined) row.permission_overrides = patch.overrides;
    if (patch.status !== undefined) row.status = patch.status;
    const { data, error } = await this.scopedQuery(org).table("org_members").update(row).eq("user_id", userId).eq("version", expectedVersion).select("user_id");
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown[]).length === 1;
  }
}

/** `hr_employees.user_id` — a ligação conta ↔ ficha. */
export class SupabaseEmployeeLinkAdapter implements EmployeeLinkPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async listLinks(org: OrganizationId): Promise<Map<string, EmployeeLink>> {
    const { data, error } = await this.scopedQuery(org).table("hr_employees").select("id, full_name, email, status, user_id").not("user_id", "is", null);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Array<{ id: string; full_name: string; email: string | null; status: string; user_id: string }>;
    return new Map(rows.map((r) => [r.user_id, { employeeId: r.id, fullName: r.full_name, email: r.email, active: r.status === "active" }]));
  }

  async listActiveEmployees(org: OrganizationId) {
    const { data, error } = await this.scopedQuery(org).table("hr_employees").select("id, full_name, email, status, user_id").eq("status", "active").order("full_name");
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Array<{ id: string; full_name: string; email: string | null; status: string; user_id: string | null }>).map((r) => ({
      employeeId: r.id,
      fullName: r.full_name,
      email: r.email,
      active: true,
      linkedUserId: r.user_id,
    }));
  }

  async findEmployee(org: OrganizationId, employeeId: string) {
    const { data, error } = await this.scopedQuery(org).table("hr_employees").select("id, full_name, email, status, user_id").eq("id", employeeId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const r = data as unknown as { id: string; full_name: string; email: string | null; status: string; user_id: string | null };
    return { employeeId: r.id, fullName: r.full_name, email: r.email, active: r.status === "active", linkedUserId: r.user_id };
  }

  async link(org: OrganizationId, employeeId: string, userId: string): Promise<void> {
    const { error } = await this.scopedQuery(org).table("hr_employees").update({ user_id: userId }).eq("id", employeeId);
    if (error) throw new Error(error.message);
  }

  async unlinkUser(org: OrganizationId, userId: string): Promise<void> {
    const { error } = await this.scopedQuery(org).table("hr_employees").update({ user_id: null }).eq("user_id", userId);
    if (error) throw new Error(error.message);
  }
}

/** Supabase Auth via `authAdmin` (listagem paginada — uma empresa tem dezenas de contas). */
export class SupabaseAccountDirectory implements AccountDirectoryPort {
  private async all(): Promise<AccountInfo[]> {
    const out: AccountInfo[] = [];
    const perPage = 1000;
    for (let page = 1; ; page++) {
      const { data, error } = await authAdmin.listUsers(page, perPage);
      if (error) throw new Error(error.message);
      for (const u of data.users) out.push({ userId: u.id, email: (u.email ?? "").toLowerCase(), lastSignInAt: u.last_sign_in_at ?? null });
      if (data.users.length < perPage) break;
    }
    return out;
  }

  async listAccounts(userIds: string[]): Promise<Map<string, AccountInfo>> {
    const wanted = new Set(userIds);
    return new Map((await this.all()).filter((a) => wanted.has(a.userId)).map((a) => [a.userId, a]));
  }

  async findByEmail(email: string): Promise<AccountInfo | null> {
    const e = email.trim().toLowerCase();
    return (await this.all()).find((a) => a.email === e) ?? null;
  }

  async createAccount(email: string, temporaryPassword: string): Promise<string> {
    const { data, error } = await authAdmin.createUser({ email, password: temporaryPassword, email_confirm: true, user_metadata: { must_change_password: true } });
    if (error) throw new AccessValidationError(error.message.toLowerCase().includes("already") ? "Já existe uma conta com este email" : error.message);
    return data.user.id;
  }

  async setTemporaryPassword(userId: string, temporaryPassword: string): Promise<void> {
    const { error } = await authAdmin.setTemporaryPassword(userId, temporaryPassword);
    if (error) throw new Error(error.message);
  }

  async deleteAccount(userId: string): Promise<void> {
    const { error } = await authAdmin.deleteUser(userId);
    if (error) throw new Error(error.message);
  }
}

/** Histórico de utilizadores/perfis em `organization_audit_logs` (sem tabela nova). Fire-and-forget. */
export class SupabaseAccessAudit implements AccessAuditPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async record(entry: Parameters<AccessAuditPort["record"]>[0]): Promise<void> {
    const { error } = await this.scopedQuery(entry.organizationId)
      .table("organization_audit_logs")
      .insert({
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        action: entry.action,
        actor: entry.actor,
        payload_before: entry.before ?? null,
        payload_after: entry.after ?? null,
      });
    if (error) console.error(`[access-audit] ${error.message}`);
  }
}
