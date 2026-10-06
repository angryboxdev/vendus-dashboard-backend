import type { NextFunction, Request, Response } from "express";
import { mintOrganizationId, type OrganizationId } from "../../../../kernel/organization-id.js";
import { SYSTEM_PROFILE_DEFAULTS, type SystemProfileKey } from "../../domain/catalog.js";
import type { AccessMemberRecord, AccessProfileRecord, AccessRepositoryPort } from "../../domain/ports/out/access-repository.port.js";
import { ResolveAccessUseCase } from "../../application/use-cases/resolve-access.use-case.js";
import { createAccessGuards } from "../../adapters/in/access-guards.js";

const ORG = mintOrganizationId("org-a");
const OTHER = mintOrganizationId("org-b");

class FakeAccessRepository implements AccessRepositoryPort {
  readonly members = new Map<string, AccessMemberRecord>();
  readonly profiles: Array<AccessProfileRecord & { org: string }> = [];
  calls = 0;

  constructor() {
    for (const [key, p] of Object.entries(SYSTEM_PROFILE_DEFAULTS)) {
      this.profiles.push({ org: String(ORG), id: `p-${key}`, systemKey: key as SystemProfileKey, name: p.name, description: null, isProtected: p.protected, active: true, permissions: { ...p.permissions }, version: 1 });
    }
  }
  member(userId: string, m: Partial<AccessMemberRecord> = {}) {
    this.members.set(`${String(ORG)}:${userId}`, { userId, legacyRole: "manager", profileId: "p-manager", overrides: {}, status: "active", version: 1, ...m });
  }
  async findMember(org: OrganizationId, userId: string) {
    this.calls++;
    return this.members.get(`${String(org)}:${userId}`) ?? null;
  }
  async findProfileById(org: OrganizationId, id: string) {
    return this.profiles.find((p) => p.org === String(org) && p.id === id) ?? null;
  }
  async findSystemProfile(org: OrganizationId, key: SystemProfileKey) {
    return this.profiles.find((p) => p.org === String(org) && p.systemKey === key) ?? null;
  }
}

function setup() {
  const repo = new FakeAccessRepository();
  let t = 0;
  const resolve = new ResolveAccessUseCase(repo, 15_000, () => t);
  return { repo, resolve, advance: (ms: number) => (t += ms) };
}

describe("ResolveAccessUseCase", () => {
  it("Manager com exceção: Stock READ só para ele; o resto herda do perfil", async () => {
    const { repo, resolve } = setup();
    repo.member("gabriel", { overrides: { "stock.items": "READ" } });
    repo.member("catarina");
    const g = (await resolve.execute(ORG, "gabriel"))!;
    const c = (await resolve.execute(ORG, "catarina"))!;
    expect(g.permissions["stock.items"]).toBe("READ");
    expect(c.permissions["stock.items"]).toBe("MANAGE");
    expect(g.modules.find((m) => m.moduleKey === "stock")!.customized).toBe(true);
  });

  it("herança dinâmica: alterar o perfil (e invalidar) muda quem herda, não quem tem exceção", async () => {
    const { repo, resolve } = setup();
    repo.member("catarina");
    repo.member("gabriel", { overrides: { "crm.customers": "NONE" } });
    repo.profiles.find((p) => p.id === "p-manager")!.permissions["crm.customers"] = "READ";
    resolve.invalidate(ORG);
    expect((await resolve.execute(ORG, "catarina"))!.permissions["crm.customers"]).toBe("READ");
    expect((await resolve.execute(ORG, "gabriel"))!.permissions["crm.customers"]).toBe("NONE");
  });

  it("revogação: cache curta, mas `invalidate` faz efeito no pedido seguinte", async () => {
    const { repo, resolve } = setup();
    repo.member("gabriel");
    expect((await resolve.execute(ORG, "gabriel"))!.active).toBe(true);
    repo.member("gabriel", { status: "disabled" });
    expect((await resolve.execute(ORG, "gabriel"))!.active).toBe(true); // ainda em cache
    resolve.invalidate(ORG, "gabriel");
    expect((await resolve.execute(ORG, "gabriel"))!.active).toBe(false);
  });

  it("cache expira sozinha ao fim do TTL (várias instâncias)", async () => {
    const { repo, resolve, advance } = setup();
    repo.member("gabriel");
    await resolve.execute(ORG, "gabriel");
    await resolve.execute(ORG, "gabriel");
    expect(repo.calls).toBe(1);
    advance(15_001);
    await resolve.execute(ORG, "gabriel");
    expect(repo.calls).toBe(2);
  });

  it("sem profile_id usa o perfil do papel antigo; Colaborador nunca tem módulos de gestão", async () => {
    const { repo, resolve } = setup();
    repo.member("ana", { profileId: null, legacyRole: "admin" });
    repo.member("carlos", { profileId: "p-colaborador", legacyRole: "employee", overrides: { "finance.invoices": "MANAGE" } });
    expect((await resolve.execute(ORG, "ana"))!.isAdmin).toBe(true);
    const carlos = (await resolve.execute(ORG, "carlos"))!;
    expect(carlos.portalOnly).toBe(true);
    expect(carlos.permissions["finance.invoices"]).toBe("NONE");
  });

  it("tenant: membro de outra organização não é resolvido", async () => {
    const { repo, resolve } = setup();
    repo.member("gabriel");
    expect(await resolve.execute(OTHER, "gabriel")).toBeNull();
  });
});

describe("Guardas HTTP", () => {
  function run(handler: (req: Request, res: Response, next: NextFunction) => unknown, req: Partial<Request>) {
    let status: number | undefined;
    let body: unknown;
    const res = { status: (s: number) => ((status = s), { json: (b: unknown) => (body = b) }) } as unknown as Response;
    const next = jest.fn();
    return Promise.resolve(handler(req as Request, res, next as unknown as NextFunction)).then(() => ({ status, body, passed: next.mock.calls.length === 1, req }));
  }

  it("conta desativada → 403 USER_DISABLED no pedido seguinte; READ não chega para escrever", async () => {
    const { repo, resolve } = setup();
    const guards = createAccessGuards(resolve);
    repo.member("gabriel", { status: "disabled" });
    const r1 = await run(guards.loadAccess, { auth: { orgId: ORG, sub: "gabriel", email: "g", orgRole: "manager" } });
    expect(r1).toMatchObject({ status: 403, passed: false, body: { code: "USER_DISABLED" } });

    repo.member("catarina");
    const r2 = await run(guards.loadAccess, { auth: { orgId: ORG, sub: "catarina", email: "c", orgRole: "manager" } });
    expect(r2.passed).toBe(true);
    const req = r2.req;
    expect((await run(guards.requirePermission("hr.employees", "READ"), req)).passed).toBe(true);
    expect((await run(guards.requirePermission("hr.employees", "MANAGE"), req)).status).toBe(403);
    expect((await run(guards.requireAdmin, req)).status).toBe(403);
  });
});
