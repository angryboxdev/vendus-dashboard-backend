import { mintOrganizationId, type OrganizationId } from "../../../../kernel/organization-id.js";
import { SYSTEM_PROFILE_DEFAULTS, type SystemProfileKey } from "../../domain/catalog.js";
import { AccessConflictError, AccessValidationError, LastAdminError, ProtectedProfileError } from "../../domain/errors.js";
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
import { moduleBulk } from "../../domain/services/effective-access.service.js";
import { AccessAdminUseCases } from "../../application/use-cases/access-admin.use-cases.js";
import { ResolveAccessUseCase } from "../../application/use-cases/resolve-access.use-case.js";

const ORG = mintOrganizationId("org-a");

class Fakes implements AccessAdminRepositoryPort, EmployeeLinkPort, AccountDirectoryPort, AccessAuditPort {
  members: AccessMemberRecord[] = [];
  profiles: AccessProfileRecord[] = [];
  employees: Array<EmployeeLink & { linkedUserId: string | null }> = [];
  accounts: AccountInfo[] = [];
  audit: Array<{ entityType: string; action: string; entityId: string }> = [];
  failLink = false;
  private seq = 0;

  constructor() {
    for (const [key, p] of Object.entries(SYSTEM_PROFILE_DEFAULTS)) {
      this.profiles.push({ id: `p-${key}`, systemKey: key as SystemProfileKey, name: p.name, description: p.description, isProtected: p.protected, active: true, permissions: { ...p.permissions }, version: 1 });
    }
  }
  seedUser(userId: string, profile: SystemProfileKey, email = `${userId}@example.com`) {
    this.members.push({ userId, legacyRole: profile === "admin" ? "admin" : "manager", profileId: `p-${profile}`, overrides: {}, status: "active", version: 1 });
    this.accounts.push({ userId, email, lastSignInAt: null });
  }
  // AccessAdminRepositoryPort
  async listMembers(_o: OrganizationId) { return this.members.map((m) => ({ ...m })); }
  async listProfiles(_o: OrganizationId) { return this.profiles.map((p) => ({ ...p, permissions: { ...p.permissions } })); }
  async findProfileById(_o: OrganizationId, id: string) { const p = this.profiles.find((x) => x.id === id); return p ? { ...p, permissions: { ...p.permissions } } : null; }
  async findSystemProfile(_o: OrganizationId, key: SystemProfileKey) { return this.profiles.find((x) => x.systemKey === key) ?? null; }
  async insertProfile(_o: OrganizationId, input: NewProfileInput) {
    if (this.profiles.some((p) => p.name.toLowerCase() === input.name.toLowerCase())) throw new AccessValidationError("Já existe um perfil com esse nome");
    const p: AccessProfileRecord = { id: `p-new-${++this.seq}`, systemKey: null, name: input.name, description: input.description, isProtected: false, active: true, permissions: { ...input.permissions }, version: 1 };
    this.profiles.push(p);
    return { ...p };
  }
  async updateProfile(_o: OrganizationId, id: string, patch: ProfilePatch, v: number) {
    const p = this.profiles.find((x) => x.id === id)!;
    if (p.version !== v) return null;
    Object.assign(p, patch, { version: v + 1 });
    return { ...p, permissions: { ...p.permissions } };
  }
  async insertMember(_o: OrganizationId, userId: string, profileId: string, legacyRole: string) {
    this.members.push({ userId, legacyRole, profileId, overrides: {}, status: "active", version: 1 });
  }
  async updateMember(_o: OrganizationId, userId: string, patch: MemberPatch, v: number) {
    const m = this.members.find((x) => x.userId === userId)!;
    if (m.version !== v) return false;
    if (patch.profileId !== undefined) m.profileId = patch.profileId;
    if (patch.legacyRole !== undefined) m.legacyRole = patch.legacyRole;
    if (patch.overrides !== undefined) m.overrides = patch.overrides;
    if (patch.status !== undefined) m.status = patch.status;
    m.version = v + 1;
    return true;
  }
  // EmployeeLinkPort
  async listActiveEmployees(_o: OrganizationId) { return this.employees.filter((e) => e.active); }
  async listLinks(_o: OrganizationId) { return new Map(this.employees.filter((e) => e.linkedUserId).map((e) => [e.linkedUserId!, e])); }
  async findEmployee(_o: OrganizationId, id: string) { return this.employees.find((e) => e.employeeId === id) ?? null; }
  async link(_o: OrganizationId, employeeId: string, userId: string) {
    if (this.failLink) throw new Error("falha simulada");
    this.employees.find((e) => e.employeeId === employeeId)!.linkedUserId = userId;
  }
  async unlinkUser(_o: OrganizationId, userId: string) { for (const e of this.employees) if (e.linkedUserId === userId) e.linkedUserId = null; }
  // AccountDirectoryPort
  async listAccounts(ids: string[]) { return new Map(this.accounts.filter((a) => ids.includes(a.userId)).map((a) => [a.userId, a])); }
  async findByEmail(email: string) { return this.accounts.find((a) => a.email === email) ?? null; }
  async createAccount(email: string) { const userId = `u-${++this.seq}`; this.accounts.push({ userId, email, lastSignInAt: null }); return userId; }
  async setTemporaryPassword() {}
  async deleteAccount(userId: string) { this.accounts = this.accounts.filter((a) => a.userId !== userId); }
  // AccessAuditPort
  async record(e: { entityType: string; action: string; entityId: string }) { this.audit.push({ entityType: e.entityType, action: e.action, entityId: e.entityId }); }
}

function setup() {
  const f = new Fakes();
  f.seedUser("bruno", "admin");
  f.seedUser("gabriel", "manager");
  f.seedUser("catarina", "manager");
  // Dados fictícios (RGPD).
  f.employees.push({ employeeId: "e-gabriel", fullName: "Gabriel Teste", email: "pessoal@example.com", active: true, linkedUserId: null });
  f.employees.push({ employeeId: "e-carlos", fullName: "Carlos Teste", email: null, active: true, linkedUserId: null });
  const resolve = new ResolveAccessUseCase({ findMember: async (_o, id) => f.members.find((m) => m.userId === id) ?? null, findProfileById: (o, id) => f.findProfileById(o, id), findSystemProfile: (o, k) => f.findSystemProfile(o, k) }, 60_000);
  const uc = new AccessAdminUseCases(f, f, f, f, resolve);
  const who = { organizationId: ORG, actor: "bruno@example.com", actorUserId: "bruno" };
  return { f, uc, who, resolve };
}

describe("Utilizadores", () => {
  it("criar com perfil Manager: recebe as permissões do Manager, palavra-passe temporária e fica no histórico", async () => {
    const { f, uc, who } = setup();
    const { user, temporaryPassword } = await uc.createUser({ ...who, email: "Nova@Example.com", profileId: "p-manager", employeeId: null });
    expect(temporaryPassword).toHaveLength(12);
    expect(user).toMatchObject({ email: "nova@example.com", profile: { name: "Manager" }, overridesCount: 0 });
    expect(user.permissions["hr.schedules"]).toBe("MANAGE");
    expect(user.permissions["finance.invoices"]).toBe("NONE");
    expect(f.members.find((m) => m.userId === user.userId)!.legacyRole).toBe("manager");
    expect(f.audit.at(-1)).toMatchObject({ entityType: "user", action: "created" });
  });

  it("Colaborador exige ficha; email já existente e ficha já ligada são recusados; falha a ligar não deixa conta órfã", async () => {
    const { f, uc, who } = setup();
    await expect(uc.createUser({ ...who, email: "x@example.com", profileId: "p-colaborador", employeeId: null })).rejects.toThrow(/ficha/);
    await expect(uc.createUser({ ...who, email: "gabriel@example.com", profileId: "p-manager", employeeId: null })).rejects.toThrow(/Já existe uma conta/);
    const { user } = await uc.createUser({ ...who, email: "carlos@example.com", profileId: "p-colaborador", employeeId: "e-carlos" });
    expect(user).toMatchObject({ portalOnly: true, employee: { fullName: "Carlos Teste" } });
    await expect(uc.createUser({ ...who, email: "outro@example.com", profileId: "p-colaborador", employeeId: "e-carlos" })).rejects.toThrow(/já está ligado/);
    f.failLink = true;
    const before = f.accounts.length;
    await expect(uc.createUser({ ...who, email: "y@example.com", profileId: "p-colaborador", employeeId: "e-gabriel" })).rejects.toThrow("falha simulada");
    expect(f.accounts.length).toBe(before);
  });

  it("gestor que também é colaborador: liga a SUA conta à ficha pelo Editar (email da ficha é pessoal), sem 2.ª conta", async () => {
    const { f, uc, who } = setup();
    const g = await uc.updateUser({ ...who, userId: "gabriel", version: 1, employeeId: "e-gabriel" });
    expect(g).toMatchObject({ profile: { name: "Manager" }, employee: { id: "e-gabriel" } });
    expect(f.accounts.filter((a) => a.email.startsWith("gabriel")).length).toBe(1);
  });

  it("personalização e Restaurar padrão: Gabriel Stock READ só para ele; remover a exceção volta ao valor do perfil", async () => {
    const { uc, who } = setup();
    const g = await uc.updateUser({ ...who, userId: "gabriel", version: 1, overrides: { "stock.items": "READ" } });
    expect(g.permissions["stock.items"]).toBe("READ");
    expect(g.overridesCount).toBe(1);
    expect((await uc.getUser(ORG, "catarina")).permissions["stock.items"]).toBe("MANAGE");
    const restored = await uc.updateUser({ ...who, userId: "gabriel", version: 2, overrides: {} });
    expect(restored.permissions["stock.items"]).toBe("MANAGE");
  });

  it("módulo em massa: Financeiro Sem acesso + Faturas READ → Personalizado", async () => {
    const { uc, who } = setup();
    const u = await uc.updateUser({ ...who, userId: "catarina", version: 1, overrides: { ...moduleBulk("finance", "NONE"), "finance.invoices": "READ" } });
    expect(u.modules.find((m) => m.moduleKey === "finance")).toMatchObject({ customized: true, granted: 1 });
  });

  it("último Admin: não se rebaixa nem se desativa; e ninguém se desativa a si próprio", async () => {
    const { uc, who } = setup();
    await expect(uc.updateUser({ ...who, userId: "bruno", version: 1, profileId: "p-manager" })).rejects.toBeInstanceOf(LastAdminError);
    await expect(uc.setUserStatus({ ...who, actorUserId: "gabriel", userId: "bruno", version: 1, status: "disabled" })).rejects.toBeInstanceOf(LastAdminError);
    await expect(uc.setUserStatus({ ...who, userId: "bruno", version: 1, status: "disabled" })).rejects.toThrow(/própria conta/);
  });

  it("desativar invalida a cache: o pedido seguinte já vê a conta desativada", async () => {
    const { uc, who, resolve } = setup();
    expect((await resolve.execute(ORG, "gabriel"))!.active).toBe(true);
    await uc.setUserStatus({ ...who, userId: "gabriel", version: 1, status: "disabled" });
    expect((await resolve.execute(ORG, "gabriel"))!.active).toBe(false);
  });

  it("concorrência: versão desatualizada → conflito (nada sobrescrito em silêncio)", async () => {
    const { uc, who } = setup();
    await uc.updateUser({ ...who, userId: "gabriel", version: 1, overrides: { "crm.contacts": "READ" } });
    await expect(uc.updateUser({ ...who, userId: "gabriel", version: 1, overrides: {} })).rejects.toBeInstanceOf(AccessConflictError);
  });
});

describe("Perfis de acesso", () => {
  it("duplicar Manager como Supervisor: começa com as mesmas permissões", async () => {
    const { uc, who } = setup();
    const sup = await uc.createProfile({ ...who, name: "Supervisor de Loja", description: null, baseProfileId: "p-manager" });
    expect(sup.permissions).toEqual(SYSTEM_PROFILE_DEFAULTS.manager.permissions);
    expect(sup).toMatchObject({ isProtected: false, userCount: 0 });
    const empty = await uc.createProfile({ ...who, name: "Vazio", description: null, baseProfileId: null });
    expect(empty.permissions).toEqual({});
    await expect(uc.createProfile({ ...who, name: "manager", description: null, baseProfileId: null })).rejects.toThrow(/Já existe/);
  });

  it("herança: alterar o Manager muda quem herda; a exceção individual fica", async () => {
    const { uc, who } = setup();
    await uc.updateUser({ ...who, userId: "gabriel", version: 1, overrides: { "crm.customers": "NONE" } });
    const manager = (await uc.listProfiles(ORG)).find((p) => p.systemKey === "manager")!;
    await uc.updateProfile({ ...who, profileId: manager.id, version: manager.version, permissions: { ...manager.permissions, "crm.customers": "READ" } });
    expect((await uc.getUser(ORG, "catarina")).permissions["crm.customers"]).toBe("READ");
    expect((await uc.getUser(ORG, "gabriel")).permissions["crm.customers"]).toBe("NONE");
  });

  it("Admin e Colaborador protegidos; perfil desativado não se atribui; contagem de utilizadores", async () => {
    const { uc, who } = setup();
    await expect(uc.updateProfile({ ...who, profileId: "p-admin", version: 1, permissions: {} })).rejects.toBeInstanceOf(ProtectedProfileError);
    await expect(uc.setProfileActive({ ...who, profileId: "p-colaborador", version: 1, active: false })).rejects.toBeInstanceOf(ProtectedProfileError);
    const fin = await uc.setProfileActive({ ...who, profileId: "p-financeiro", version: 1, active: false });
    expect(fin.active).toBe(false);
    await expect(uc.updateUser({ ...who, userId: "catarina", version: 1, profileId: "p-financeiro" })).rejects.toThrow(/perfil de acesso ativo/);
    expect((await uc.listProfiles(ORG)).find((p) => p.systemKey === "manager")!.userCount).toBe(2);
  });
});
