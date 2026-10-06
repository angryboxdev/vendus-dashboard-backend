import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PermissionMap, SystemProfileKey } from "../../catalog.js";
import type { AccessMemberRecord, AccessProfileRecord, MemberStatus } from "./access-repository.port.js";

export interface NewProfileInput {
  name: string;
  description: string | null;
  permissions: PermissionMap;
  createdBy: string;
}

export interface ProfilePatch {
  name?: string;
  description?: string | null;
  permissions?: PermissionMap;
  active?: boolean;
}

export interface MemberPatch {
  profileId?: string;
  /** Papel antigo sincronizado com o perfil (token hook / guardas legadas durante a transição). */
  legacyRole?: string;
  overrides?: PermissionMap;
  status?: MemberStatus;
}

/** Escritas de Perfis e Utilizadores (só Admin). `expectedVersion` = concorrência otimista: null quando outro Admin gravou entretanto. */
export interface AccessAdminRepositoryPort {
  listMembers(organizationId: OrganizationId): Promise<AccessMemberRecord[]>;
  listProfiles(organizationId: OrganizationId): Promise<AccessProfileRecord[]>;
  findProfileById(organizationId: OrganizationId, profileId: string): Promise<AccessProfileRecord | null>;
  findSystemProfile(organizationId: OrganizationId, key: SystemProfileKey): Promise<AccessProfileRecord | null>;
  insertProfile(organizationId: OrganizationId, input: NewProfileInput): Promise<AccessProfileRecord>;
  updateProfile(organizationId: OrganizationId, profileId: string, patch: ProfilePatch, expectedVersion: number): Promise<AccessProfileRecord | null>;
  insertMember(organizationId: OrganizationId, userId: string, profileId: string, legacyRole: string): Promise<void>;
  updateMember(organizationId: OrganizationId, userId: string, patch: MemberPatch, expectedVersion: number): Promise<boolean>;
}

export interface EmployeeLink {
  employeeId: string;
  fullName: string;
  email: string | null;
  active: boolean;
}

/** Ligação conta ↔ ficha (`hr_employees.user_id`) — uma conta por colaborador. */
export interface EmployeeLinkPort {
  /** Fichas ativas (para o seletor "Associado a colaborador"), com a conta já ligada, se houver. */
  listActiveEmployees(organizationId: OrganizationId): Promise<Array<EmployeeLink & { linkedUserId: string | null }>>;
  listLinks(organizationId: OrganizationId): Promise<Map<string, EmployeeLink>>;
  findEmployee(organizationId: OrganizationId, employeeId: string): Promise<(EmployeeLink & { linkedUserId: string | null }) | null>;
  link(organizationId: OrganizationId, employeeId: string, userId: string): Promise<void>;
  unlinkUser(organizationId: OrganizationId, userId: string): Promise<void>;
}

export interface AccountInfo {
  userId: string;
  email: string;
  lastSignInAt: string | null;
}

/** Contas de autenticação (Supabase Auth). Nunca é a fonte de permissões. */
export interface AccountDirectoryPort {
  listAccounts(userIds: string[]): Promise<Map<string, AccountInfo>>;
  findByEmail(email: string): Promise<AccountInfo | null>;
  /** Cria conta com palavra-passe temporária (mudança obrigatória no 1º login). */
  createAccount(email: string, temporaryPassword: string): Promise<string>;
  setTemporaryPassword(userId: string, temporaryPassword: string): Promise<void>;
  deleteAccount(userId: string): Promise<void>;
}

export type AccessAuditEntity = "user" | "access_profile";

export interface AccessAuditPort {
  record(entry: {
    organizationId: OrganizationId;
    actor: string;
    entityType: AccessAuditEntity;
    entityId: string;
    action: string;
    before?: unknown;
    after?: unknown;
  }): Promise<void>;
}
