import { randomInt } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { LEGACY_ROLE_TO_PROFILE, type PermissionMap, type SystemProfileKey } from "../../domain/catalog.js";
import { AccessConflictError, AccessNotFoundError, AccessValidationError, LastAdminError, ProtectedProfileError } from "../../domain/errors.js";
import type {
  AccessAdminPort,
  AccessProfileDTO,
  CreateProfileCommand,
  CreateUserCommand,
  SetProfileActiveCommand,
  SetUserStatusCommand,
  UpdateProfileCommand,
  UpdateUserCommand,
  UserDetailDTO,
} from "../../domain/ports/in/access-admin.ports.js";
import type { ResolveAccessPort } from "../../domain/ports/in/resolve-access.port.js";
import type { AccessAdminRepositoryPort, AccessAuditPort, AccountDirectoryPort, AccountInfo, EmployeeLink, EmployeeLinkPort } from "../../domain/ports/out/access-admin.port.js";
import type { AccessMemberRecord, AccessProfileRecord } from "../../domain/ports/out/access-repository.port.js";
import { effectivePermissions, sanitizePermissionMap, summarizeModules } from "../../domain/services/effective-access.service.js";

const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
export function generateTemporaryPassword(length = 12): string {
  return Array.from({ length }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join("");
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Papel antigo mantido em sincronia com o perfil (token hook e guardas legadas durante a transição). */
export function legacyRoleFor(systemKey: SystemProfileKey | null): string {
  if (systemKey === "admin") return "admin";
  if (systemKey === "colaborador") return "employee";
  return "manager";
}

interface Loaded {
  members: AccessMemberRecord[];
  profiles: AccessProfileRecord[];
}

/**
 * Utilizadores & Perfis de Acesso (tickets 05–06). Só Admin (a rota é
 * `admin` na tabela central). Regras: nunca 0 Admins ativos; Admin e
 * Colaborador protegidos; concorrência por `version`; Colaborador exige
 * ficha; uma conta por colaborador; nunca cria colaboradores; cada escrita
 * invalida a cache de acessos e fica no histórico.
 */
export class AccessAdminUseCases implements AccessAdminPort {
  constructor(
    private readonly repo: AccessAdminRepositoryPort,
    private readonly employees: EmployeeLinkPort,
    private readonly accounts: AccountDirectoryPort,
    private readonly audit: AccessAuditPort,
    private readonly resolveAccess: ResolveAccessPort,
  ) {}

  // ── leitura ───────────────────────────────────────────────────────────

  private async load(org: OrganizationId): Promise<Loaded> {
    const [members, profiles] = await Promise.all([this.repo.listMembers(org), this.repo.listProfiles(org)]);
    return { members, profiles };
  }

  private profileOf(member: AccessMemberRecord, profiles: AccessProfileRecord[]): AccessProfileRecord | null {
    if (member.profileId) {
      const p = profiles.find((x) => x.id === member.profileId);
      if (p) return p;
    }
    const fallback = LEGACY_ROLE_TO_PROFILE[member.legacyRole];
    return profiles.find((x) => x.systemKey === fallback) ?? null;
  }

  private toDetail(member: AccessMemberRecord, profiles: AccessProfileRecord[], account: AccountInfo | undefined, employee: EmployeeLink | undefined): UserDetailDTO {
    const profile = this.profileOf(member, profiles);
    const isAdmin = profile?.systemKey === "admin";
    const portalOnly = profile?.systemKey === "colaborador";
    const overrides = portalOnly ? {} : member.overrides;
    const profilePermissions = portalOnly ? {} : (profile?.permissions ?? {});
    const permissions = effectivePermissions(profilePermissions, overrides, isAdmin);
    const email = account?.email ?? "";
    return {
      userId: member.userId,
      email,
      displayName: employee?.fullName ?? (email.split("@")[0] || member.userId),
      profile: { id: profile?.id ?? null, name: profile?.name ?? "Sem perfil", systemKey: profile?.systemKey ?? null },
      status: member.status,
      lastSignInAt: account?.lastSignInAt ?? null,
      employee: employee ? { id: employee.employeeId, fullName: employee.fullName } : null,
      isAdmin,
      portalOnly,
      modules: summarizeModules(permissions, overrides),
      overridesCount: Object.keys(overrides).length,
      version: member.version,
      permissions,
      overrides,
      profilePermissions,
    };
  }

  async listUsers(org: OrganizationId) {
    const { members, profiles } = await this.load(org);
    const [accounts, links] = await Promise.all([this.accounts.listAccounts(members.map((m) => m.userId)), this.employees.listLinks(org)]);
    return members
      .map((m) => {
        const { permissions: _p, overrides: _o, profilePermissions: _pp, ...item } = this.toDetail(m, profiles, accounts.get(m.userId), links.get(m.userId));
        return item;
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt"));
  }

  async getUser(org: OrganizationId, userId: string): Promise<UserDetailDTO> {
    const { members, profiles } = await this.load(org);
    const member = members.find((m) => m.userId === userId);
    if (!member) throw new AccessNotFoundError("Utilizador");
    const [accounts, links] = await Promise.all([this.accounts.listAccounts([userId]), this.employees.listLinks(org)]);
    return this.toDetail(member, profiles, accounts.get(userId), links.get(userId));
  }

  async listEmployeeOptions(org: OrganizationId) {
    return (await this.employees.listActiveEmployees(org)).map((e) => ({ id: e.employeeId, fullName: e.fullName, linkedUserId: e.linkedUserId }));
  }

  // ── utilizadores ──────────────────────────────────────────────────────

  private activeAdmins(members: AccessMemberRecord[], profiles: AccessProfileRecord[]): string[] {
    return members.filter((m) => m.status === "active" && this.profileOf(m, profiles)?.systemKey === "admin").map((m) => m.userId);
  }

  private assertKeepsAnAdmin(members: AccessMemberRecord[], profiles: AccessProfileRecord[], userId: string): void {
    const admins = this.activeAdmins(members, profiles);
    if (admins.includes(userId) && admins.length <= 1) throw new LastAdminError();
  }

  private async assertEmployeeFree(org: OrganizationId, employeeId: string, userId: string | null) {
    const employee = await this.employees.findEmployee(org, employeeId);
    if (!employee) throw new AccessValidationError("Colaborador não encontrado");
    if (employee.linkedUserId && employee.linkedUserId !== userId) throw new AccessValidationError("Este colaborador já está ligado a outra conta");
    if (!employee.active) throw new AccessValidationError("Só colaboradores ativos podem ser associados a uma conta");
    return employee;
  }

  async createUser(cmd: CreateUserCommand) {
    const org = cmd.organizationId;
    const email = cmd.email.trim().toLowerCase();
    if (!EMAIL.test(email)) throw new AccessValidationError("Email inválido");
    const profile = await this.repo.findProfileById(org, cmd.profileId);
    if (!profile || !profile.active) throw new AccessValidationError("Escolha um perfil de acesso ativo");
    if (profile.systemKey === "colaborador" && !cmd.employeeId) throw new AccessValidationError("Um Colaborador tem de estar associado à sua ficha");
    if (cmd.employeeId) await this.assertEmployeeFree(org, cmd.employeeId, null);
    if (await this.accounts.findByEmail(email)) {
      throw new AccessValidationError("Já existe uma conta com este email — se for desta empresa, edite-a na lista de utilizadores");
    }

    const temporaryPassword = generateTemporaryPassword();
    const userId = await this.accounts.createAccount(email, temporaryPassword);
    try {
      await this.repo.insertMember(org, userId, profile.id, legacyRoleFor(profile.systemKey));
      if (cmd.employeeId) await this.employees.link(org, cmd.employeeId, userId);
    } catch (e) {
      await this.accounts.deleteAccount(userId); // não deixa contas órfãs
      throw e;
    }
    await this.audit.record({ organizationId: org, actor: cmd.actor, entityType: "user", entityId: userId, action: "created", after: { email, profile: profile.name, employeeId: cmd.employeeId } });
    return { user: await this.getUser(org, userId), temporaryPassword };
  }

  async updateUser(cmd: UpdateUserCommand): Promise<UserDetailDTO> {
    const org = cmd.organizationId;
    const { members, profiles } = await this.load(org);
    const member = members.find((m) => m.userId === cmd.userId);
    if (!member) throw new AccessNotFoundError("Utilizador");
    if (member.version !== cmd.version) throw new AccessConflictError();
    const before = await this.getUser(org, cmd.userId);

    const currentProfile = this.profileOf(member, profiles);
    let nextProfile = currentProfile;
    if (cmd.profileId !== undefined && cmd.profileId !== currentProfile?.id) {
      nextProfile = profiles.find((p) => p.id === cmd.profileId) ?? null;
      if (!nextProfile || !nextProfile.active) throw new AccessValidationError("Escolha um perfil de acesso ativo");
      if (currentProfile?.systemKey === "admin" && nextProfile.systemKey !== "admin") this.assertKeepsAnAdmin(members, profiles, member.userId);
    }

    const links = await this.employees.listLinks(org);
    const currentEmployee = links.get(member.userId)?.employeeId ?? null;
    const nextEmployee = cmd.employeeId === undefined ? currentEmployee : cmd.employeeId;
    if (nextProfile?.systemKey === "colaborador" && !nextEmployee) throw new AccessValidationError("Um Colaborador tem de estar associado à sua ficha");
    if (nextEmployee && nextEmployee !== currentEmployee) await this.assertEmployeeFree(org, nextEmployee, member.userId);

    const overrides =
      nextProfile?.systemKey === "colaborador" || nextProfile?.systemKey === "admin"
        ? {}
        : cmd.overrides !== undefined
          ? sanitizePermissionMap(cmd.overrides)
          : member.overrides;

    const ok = await this.repo.updateMember(
      org,
      member.userId,
      { ...(nextProfile && { profileId: nextProfile.id }), legacyRole: legacyRoleFor(nextProfile?.systemKey ?? null), overrides },
      cmd.version,
    );
    if (!ok) throw new AccessConflictError();
    if (nextEmployee !== currentEmployee) {
      await this.employees.unlinkUser(org, member.userId);
      if (nextEmployee) await this.employees.link(org, nextEmployee, member.userId);
    }
    this.resolveAccess.invalidate(org, member.userId);

    const after = await this.getUser(org, member.userId);
    await this.audit.record({
      organizationId: org,
      actor: cmd.actor,
      entityType: "user",
      entityId: member.userId,
      action: "access_updated",
      before: { profile: before.profile.name, overrides: before.overrides, employee: before.employee?.fullName ?? null },
      after: { profile: after.profile.name, overrides: after.overrides, employee: after.employee?.fullName ?? null },
    });
    return after;
  }

  async setUserStatus(cmd: SetUserStatusCommand): Promise<UserDetailDTO> {
    const org = cmd.organizationId;
    const { members, profiles } = await this.load(org);
    const member = members.find((m) => m.userId === cmd.userId);
    if (!member) throw new AccessNotFoundError("Utilizador");
    if (member.version !== cmd.version) throw new AccessConflictError();
    if (member.status === cmd.status) return this.getUser(org, member.userId);
    if (cmd.status === "disabled") {
      if (member.userId === cmd.actorUserId) throw new AccessValidationError("Não pode desativar a sua própria conta");
      this.assertKeepsAnAdmin(members, profiles, member.userId);
    }
    const ok = await this.repo.updateMember(org, member.userId, { status: cmd.status }, cmd.version);
    if (!ok) throw new AccessConflictError();
    this.resolveAccess.invalidate(org, member.userId);
    await this.audit.record({ organizationId: org, actor: cmd.actor, entityType: "user", entityId: member.userId, action: cmd.status === "disabled" ? "disabled" : "enabled", before: { status: member.status }, after: { status: cmd.status } });
    return this.getUser(org, member.userId);
  }

  async resetPassword(cmd: { organizationId: OrganizationId; actor: string; actorUserId: string; userId: string }) {
    const member = (await this.repo.listMembers(cmd.organizationId)).find((m) => m.userId === cmd.userId);
    if (!member) throw new AccessNotFoundError("Utilizador");
    const temporaryPassword = generateTemporaryPassword();
    await this.accounts.setTemporaryPassword(member.userId, temporaryPassword);
    await this.audit.record({ organizationId: cmd.organizationId, actor: cmd.actor, entityType: "user", entityId: member.userId, action: "password_reset" });
    return { temporaryPassword };
  }

  // ── perfis ────────────────────────────────────────────────────────────

  private toProfileDTO(p: AccessProfileRecord, loaded: Loaded): AccessProfileDTO {
    return {
      id: p.id,
      systemKey: p.systemKey,
      name: p.name,
      description: p.description,
      isProtected: p.isProtected,
      active: p.active,
      permissions: p.permissions,
      userCount: loaded.members.filter((m) => this.profileOf(m, loaded.profiles)?.id === p.id).length,
      version: p.version,
    };
  }

  async listProfiles(org: OrganizationId) {
    const loaded = await this.load(org);
    const order: Record<string, number> = { admin: 0, manager: 1, rh: 2, financeiro: 3, colaborador: 4 };
    return loaded.profiles
      .map((p) => this.toProfileDTO(p, loaded))
      .sort((a, b) => (order[a.systemKey ?? ""] ?? 9) - (order[b.systemKey ?? ""] ?? 9) || a.name.localeCompare(b.name, "pt"));
  }

  private validName(name: string): string {
    const n = name.trim();
    if (!n) throw new AccessValidationError("Indique o nome do perfil");
    if (n.length > 60) throw new AccessValidationError("O nome do perfil tem no máximo 60 caracteres");
    return n;
  }

  async createProfile(cmd: CreateProfileCommand) {
    const org = cmd.organizationId;
    const name = this.validName(cmd.name);
    let permissions: PermissionMap = {};
    if (cmd.baseProfileId) {
      const base = await this.repo.findProfileById(org, cmd.baseProfileId);
      if (!base) throw new AccessValidationError("Perfil base não encontrado");
      permissions = { ...base.permissions };
    }
    const created = await this.repo.insertProfile(org, { name, description: cmd.description?.trim() || null, permissions, createdBy: cmd.actor });
    await this.audit.record({ organizationId: org, actor: cmd.actor, entityType: "access_profile", entityId: created.id, action: "created", after: { name, baseProfileId: cmd.baseProfileId, permissions } });
    return this.toProfileDTO(created, await this.load(org));
  }

  async updateProfile(cmd: UpdateProfileCommand) {
    const org = cmd.organizationId;
    const current = await this.repo.findProfileById(org, cmd.profileId);
    if (!current) throw new AccessNotFoundError("Perfil");
    if (current.isProtected) throw new ProtectedProfileError();
    if (current.version !== cmd.version) throw new AccessConflictError();
    const patch = {
      ...(cmd.name !== undefined && { name: this.validName(cmd.name) }),
      ...(cmd.description !== undefined && { description: cmd.description?.trim() || null }),
      ...(cmd.permissions !== undefined && { permissions: sanitizePermissionMap(cmd.permissions) }),
    };
    const updated = await this.repo.updateProfile(org, current.id, patch, cmd.version);
    if (!updated) throw new AccessConflictError();
    // Herança dinâmica: quem herda deste perfil muda já; exceções individuais ficam intactas.
    this.resolveAccess.invalidate(org);
    await this.audit.record({
      organizationId: org,
      actor: cmd.actor,
      entityType: "access_profile",
      entityId: current.id,
      action: "updated",
      before: { name: current.name, description: current.description, permissions: current.permissions },
      after: { name: updated.name, description: updated.description, permissions: updated.permissions },
    });
    return this.toProfileDTO(updated, await this.load(org));
  }

  async setProfileActive(cmd: SetProfileActiveCommand) {
    const org = cmd.organizationId;
    const current = await this.repo.findProfileById(org, cmd.profileId);
    if (!current) throw new AccessNotFoundError("Perfil");
    if (current.isProtected) throw new ProtectedProfileError("Os perfis Admin e Colaborador não podem ser desativados.");
    if (current.version !== cmd.version) throw new AccessConflictError();
    if (current.active === cmd.active) return this.toProfileDTO(current, await this.load(org));
    const updated = await this.repo.updateProfile(org, current.id, { active: cmd.active }, cmd.version);
    if (!updated) throw new AccessConflictError();
    await this.audit.record({ organizationId: org, actor: cmd.actor, entityType: "access_profile", entityId: current.id, action: cmd.active ? "enabled" : "disabled", before: { active: current.active }, after: { active: cmd.active } });
    return this.toProfileDTO(updated, await this.load(org));
  }
}
