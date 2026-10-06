import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PermissionMap, SystemProfileKey } from "../../catalog.js";
import type { ModuleSummary } from "../../services/effective-access.service.js";
import type { MemberStatus } from "../out/access-repository.port.js";

export interface AccessProfileDTO {
  id: string;
  systemKey: SystemProfileKey | null;
  name: string;
  description: string | null;
  isProtected: boolean;
  active: boolean;
  permissions: PermissionMap;
  userCount: number;
  version: number;
}

export interface UserListItemDTO {
  userId: string;
  email: string;
  displayName: string;
  profile: { id: string | null; name: string; systemKey: SystemProfileKey | null };
  status: MemberStatus;
  lastSignInAt: string | null;
  employee: { id: string; fullName: string } | null;
  isAdmin: boolean;
  portalOnly: boolean;
  modules: ModuleSummary[];
  /** Nº de exceções individuais ("Personalizado · N alterações"). */
  overridesCount: number;
  version: number;
}

export interface UserDetailDTO extends UserListItemDTO {
  permissions: PermissionMap;
  overrides: PermissionMap;
  profilePermissions: PermissionMap;
}

interface AdminCommand {
  organizationId: OrganizationId;
  /** Email do Admin que executa (histórico). */
  actor: string;
  /** userId do Admin que executa (não se pode desativar a si próprio). */
  actorUserId: string;
}

export interface CreateUserCommand extends AdminCommand {
  email: string;
  profileId: string;
  employeeId: string | null;
}

export interface UpdateUserCommand extends AdminCommand {
  userId: string;
  version: number;
  profileId?: string;
  overrides?: Record<string, unknown>;
  /** null = desligar da ficha. */
  employeeId?: string | null;
}

export interface SetUserStatusCommand extends AdminCommand {
  userId: string;
  version: number;
  status: MemberStatus;
}

export interface CreateProfileCommand extends AdminCommand {
  name: string;
  description: string | null;
  /** Perfil a copiar (null = começar sem acessos). */
  baseProfileId: string | null;
}

export interface UpdateProfileCommand extends AdminCommand {
  profileId: string;
  version: number;
  name?: string;
  description?: string | null;
  permissions?: Record<string, unknown>;
}

export interface SetProfileActiveCommand extends AdminCommand {
  profileId: string;
  version: number;
  active: boolean;
}

export interface EmployeeOptionDTO {
  id: string;
  fullName: string;
  /** Conta já ligada a esta ficha (null = livre). */
  linkedUserId: string | null;
}

export interface AccessAdminPort {
  listEmployeeOptions(organizationId: OrganizationId): Promise<EmployeeOptionDTO[]>;
  listUsers(organizationId: OrganizationId): Promise<UserListItemDTO[]>;
  getUser(organizationId: OrganizationId, userId: string): Promise<UserDetailDTO>;
  createUser(command: CreateUserCommand): Promise<{ user: UserDetailDTO; temporaryPassword: string }>;
  updateUser(command: UpdateUserCommand): Promise<UserDetailDTO>;
  setUserStatus(command: SetUserStatusCommand): Promise<UserDetailDTO>;
  resetPassword(command: AdminCommand & { userId: string }): Promise<{ temporaryPassword: string }>;
  listProfiles(organizationId: OrganizationId): Promise<AccessProfileDTO[]>;
  createProfile(command: CreateProfileCommand): Promise<AccessProfileDTO>;
  updateProfile(command: UpdateProfileCommand): Promise<AccessProfileDTO>;
  setProfileActive(command: SetProfileActiveCommand): Promise<AccessProfileDTO>;
}
