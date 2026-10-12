import { mintOrganizationId, type OrganizationId } from "../../../../kernel/organization-id.js";
import { AccessGovernanceUseCases } from "../../application/use-cases/access-governance.use-cases.js";
import { SYSTEM_PROFILE_DEFAULTS, type SystemProfileKey } from "../../domain/catalog.js";
import { AccessValidationError } from "../../domain/errors.js";
import { fieldAccess, type FieldRule } from "../../domain/field-privacy.js";
import type { AccessAuditPort } from "../../domain/ports/out/access-admin.port.js";
import type { AccessGovernanceRepositoryPort, RoleHistoryEntry } from "../../domain/ports/out/access-governance.port.js";
import type { AccessMemberRecord, AccessProfileRecord } from "../../domain/ports/out/access-repository.port.js";
import type { AccessScope, EmployeeUnits, ScopeKind } from "../../domain/services/scope.service.js";

const ORG = mintOrganizationId("org-a");

class FakeGov implements AccessGovernanceRepositoryPort {
  kinds = new Map<string, ScopeKind>();
  scopes: AccessScope[] = [];
  rules = new Map<string, FieldRule[]>();
  private n = 0;
  async getProfileScopeKind(_o: OrganizationId, id: string) {
    return this.kinds.get(id) ?? null;
  }
  async setProfileScopeKind(_o: OrganizationId, id: string, k: ScopeKind) {
    this.kinds.set(id, k);
  }
  async listScopes(_o: OrganizationId, userId: string) {
    return this.scopes.filter((s) => s.userId === userId);
  }
  async insertScope(_o: OrganizationId, s: Omit<AccessScope, "id">) {
    const x = { id: `s${++this.n}`, userId: s.userId, scopeType: s.scopeType, scopeId: s.scopeId, validFrom: s.validFrom, validTo: s.validTo };
    this.scopes.push(x);
    return x;
  }
  async endScope(_o: OrganizationId, id: string, validTo: string) {
    const s = this.scopes.find((x) => x.id === id)!;
    s.validTo = validTo;
    return { ...s };
  }
  async listFieldRules(_o: OrganizationId, profileId: string) {
    return this.rules.get(profileId) ?? [];
  }
  async upsertFieldRules(_o: OrganizationId, profileId: string, rules: FieldRule[]) {
    const cur = new Map((this.rules.get(profileId) ?? []).map((r) => [r.fieldKey, r]));
    for (const r of rules) cur.set(r.fieldKey, r);
    this.rules.set(profileId, [...cur.values()]);
  }
  async roleHistory(): Promise<RoleHistoryEntry[]> {
    return [];
  }
}

const profiles: AccessProfileRecord[] = Object.entries(SYSTEM_PROFILE_DEFAULTS).map(([k, p]) => ({
  id: `p-${k}`,
  systemKey: k as SystemProfileKey,
  name: p.name,
  description: null,
  isProtected: p.protected,
  active: true,
  permissions: p.permissions,
  version: 1,
}));
const members: AccessMemberRecord[] = [{ userId: "gerente", legacyRole: "manager", profileId: "p-manager", overrides: {}, status: "active", version: 1 }];

const UNITS: Record<string, EmployeeUnits> = {
  "e-porto": { employeeId: "e-porto", locationIds: ["loc-porto"], departmentIds: ["dep-cozinha"], groupIds: [] },
  "e-braga": { employeeId: "e-braga", locationIds: ["loc-braga"], departmentIds: ["dep-sala"], groupIds: ["g-noite"] },
  "e-gerente": { employeeId: "e-gerente", locationIds: ["loc-braga"], departmentIds: [], groupIds: [] },
};

function setup() {
  const repo = new FakeGov();
  const audit: Array<{ action: string }> = [];
  const auditPort: AccessAuditPort = { record: async (e) => void audit.push(e) };
  const uc = new AccessGovernanceUseCases(
    repo,
    { listMembers: async () => members, findProfileById: async (_o, id) => profiles.find((p) => p.id === id) ?? null },
    { unitsOf: async (_o, id) => UNITS[id]!, employeeOfUser: async () => "e-gerente" },
    auditPort,
  );
  return { repo, uc, audit };
}

const who = { userId: "gerente", isAdmin: false, profileId: "p-manager" };

describe("Âmbitos (perfil Específico)", () => {
  test("RE_34_admin_de_centro_so_gere_colaboradores_do_seu_centro", async () => {
    const { uc } = setup();
    // Perfil Geral: toda a empresa.
    expect(await uc.canManageEmployee(ORG, who, "e-porto", "2026-10-11")).toBe(true);
    await uc.setScopeKind(ORG, "p-manager", "specific", "admin@demo.invalid");
    // Específico sem âmbitos: ninguém (fecha por omissão).
    expect(await uc.canManageEmployee(ORG, who, "e-porto", "2026-10-11")).toBe(false);
    await uc.addScope(ORG, "gerente", { scopeType: "location", scopeId: "loc-porto", validFrom: "2026-10-01", validTo: "2026-10-31" }, "admin");
    expect(await uc.canManageEmployee(ORG, who, "e-porto", "2026-10-11")).toBe(true);
    expect(await uc.canManageEmployee(ORG, who, "e-braga", "2026-10-11")).toBe(false);
    expect(await uc.canManageEmployee(ORG, who, "e-porto", "2026-11-01")).toBe(false); // vigência terminou
  });

  test("âmbitos por departamento, grupo e próprio; admin gere sempre tudo", async () => {
    const { uc } = setup();
    await uc.setScopeKind(ORG, "p-manager", "specific", "admin");
    await uc.addScope(ORG, "gerente", { scopeType: "group", scopeId: "g-noite", validFrom: "2026-10-01", validTo: null }, "admin");
    await uc.addScope(ORG, "gerente", { scopeType: "self", scopeId: "ignorado", validFrom: "2026-10-01", validTo: null }, "admin");
    expect(await uc.canManageEmployee(ORG, who, "e-braga", "2026-10-11")).toBe(true);
    expect(await uc.canManageEmployee(ORG, who, "e-gerente", "2026-10-11")).toBe(true);
    expect(await uc.canManageEmployee(ORG, who, "e-porto", "2026-10-11")).toBe(false);
    expect(await uc.canManageEmployee(ORG, { ...who, isAdmin: true }, "e-porto", "2026-10-11")).toBe(true);
  });

  test("validações: alvo obrigatório, sem sobreposição, só encurtar, Admin não pode ser Específico", async () => {
    const { uc, audit } = setup();
    await expect(uc.addScope(ORG, "gerente", { scopeType: "location", scopeId: null, validFrom: "2026-10-01", validTo: null }, "a")).rejects.toThrow("Escolha");
    const s = await uc.addScope(ORG, "gerente", { scopeType: "location", scopeId: "loc-porto", validFrom: "2026-10-01", validTo: null }, "a");
    await expect(uc.addScope(ORG, "gerente", { scopeType: "location", scopeId: "loc-porto", validFrom: "2026-12-01", validTo: null }, "a")).rejects.toThrow("nesse período");
    await uc.endScope(ORG, "gerente", s.id, "2026-10-31", "a");
    await expect(uc.endScope(ORG, "gerente", s.id, "2026-12-31", "a")).rejects.toThrow("encurtar");
    await expect(uc.addScope(ORG, "fantasma", { scopeType: "self", scopeId: null, validFrom: "2026-10-01", validTo: null }, "a")).rejects.toThrow("Utilizador");
    await expect(uc.setScopeKind(ORG, "p-admin", "specific", "a")).rejects.toBeInstanceOf(AccessValidationError);
    expect(audit.map((e) => e.action)).toEqual(["scope_added", "scope_ended"]);
  });
});

describe("Privacidade por campo", () => {
  test("dados sensíveis escondidos por omissão; regra do perfil prevalece; editar exige ver", async () => {
    const { uc } = setup();
    let g = await uc.profileGovernance(ORG, "p-rh");
    expect(g.fields.find((f) => f.key === "identification.iban")).toMatchObject({ view: false, edit: false, sensitive: true, customized: false });
    expect(g.fields.find((f) => f.key === "personal.phone")).toMatchObject({ view: true, edit: false });
    await uc.setFieldPrivacy(ORG, "p-rh", [{ fieldKey: "identification.iban", canView: true, canEdit: true }], "admin");
    g = await uc.profileGovernance(ORG, "p-rh");
    expect(g.fields.find((f) => f.key === "identification.iban")).toMatchObject({ view: true, edit: true, customized: true });
    await expect(uc.setFieldPrivacy(ORG, "p-rh", [{ fieldKey: "personal.address", canView: false, canEdit: true }], "admin")).rejects.toThrow("também pode ver");
    await expect(uc.setFieldPrivacy(ORG, "p-rh", [{ fieldKey: "inventado", canView: true, canEdit: false }], "admin")).rejects.toThrow("desconhecido");
    await expect(uc.setFieldPrivacy(ORG, "p-admin", [], "admin")).rejects.toThrow("Admin");
  });

  test("admin vê e edita tudo; campo fora do catálogo nunca", () => {
    expect(fieldAccess(true, [], "identification.nif")).toEqual({ view: true, edit: true });
    expect(fieldAccess(true, [], "x.y")).toEqual({ view: false, edit: false });
  });
});
