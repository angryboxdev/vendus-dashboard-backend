import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PermissionMap, SystemProfileKey } from "../../catalog.js";

export type MemberStatus = "active" | "disabled";

/** Membership (`org_members`) vista pelo motor de autorização. */
export interface AccessMemberRecord {
  userId: string;
  /** Papel antigo — usado só para resolver o perfil quando `profileId` ainda está vazio. */
  legacyRole: string;
  profileId: string | null;
  overrides: PermissionMap;
  status: MemberStatus;
  version: number;
}

export interface AccessProfileRecord {
  id: string;
  systemKey: SystemProfileKey | null;
  name: string;
  description: string | null;
  isProtected: boolean;
  active: boolean;
  permissions: PermissionMap;
  version: number;
}

export interface AccessRepositoryPort {
  findMember(organizationId: OrganizationId, userId: string): Promise<AccessMemberRecord | null>;
  findProfileById(organizationId: OrganizationId, profileId: string): Promise<AccessProfileRecord | null>;
  findSystemProfile(organizationId: OrganizationId, key: SystemProfileKey): Promise<AccessProfileRecord | null>;
}
