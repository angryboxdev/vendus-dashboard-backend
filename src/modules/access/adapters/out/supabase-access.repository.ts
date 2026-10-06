import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { SystemProfileKey } from "../../domain/catalog.js";
import type { AccessMemberRecord, AccessProfileRecord, AccessRepositoryPort } from "../../domain/ports/out/access-repository.port.js";
import { sanitizePermissionMap } from "../../domain/services/effective-access.service.js";

export const PROFILE_COLUMNS = "id, system_key, name, description, is_protected, active, permissions, version";

export interface ProfileRow {
  id: string;
  system_key: SystemProfileKey | null;
  name: string;
  description: string | null;
  is_protected: boolean;
  active: boolean;
  permissions: Record<string, unknown> | null;
  version: number;
}

export function toProfileRecord(row: ProfileRow): AccessProfileRecord {
  return {
    id: row.id,
    systemKey: row.system_key,
    name: row.name,
    description: row.description,
    isProtected: row.is_protected,
    active: row.active,
    permissions: sanitizePermissionMap(row.permissions ?? {}),
    version: row.version,
  };
}

/** Leituras do motor de autorização — sempre pelo scoped query (organização do pedido). */
export class SupabaseAccessRepository implements AccessRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findMember(organizationId: OrganizationId, userId: string): Promise<AccessMemberRecord | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("org_members")
      .select("user_id, role, profile_id, permission_overrides, status, version")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as unknown as {
      user_id: string;
      role: string;
      profile_id: string | null;
      permission_overrides: Record<string, unknown> | null;
      status: "active" | "disabled";
      version: number;
    };
    return {
      userId: row.user_id,
      legacyRole: row.role,
      profileId: row.profile_id,
      overrides: sanitizePermissionMap(row.permission_overrides ?? {}),
      status: row.status,
      version: row.version,
    };
  }

  async findProfileById(organizationId: OrganizationId, profileId: string): Promise<AccessProfileRecord | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("access_profiles").select(PROFILE_COLUMNS).eq("id", profileId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toProfileRecord(data as unknown as ProfileRow) : null;
  }

  async findSystemProfile(organizationId: OrganizationId, key: SystemProfileKey): Promise<AccessProfileRecord | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("access_profiles").select(PROFILE_COLUMNS).eq("system_key", key).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toProfileRecord(data as unknown as ProfileRow) : null;
  }
}
