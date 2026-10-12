import { mintOrganizationId, type OrganizationId } from "../../../kernel/organization-id.js";
import { ipRateLimit } from "../adapters/in/invitations.controller.js";
import { InvitationsUseCases } from "../application/use-cases/invitations.use-cases.js";
import type { Invitation, JoinRequest } from "../domain/entities/invitation.js";
import type { InvitationCodesPort, InvitationLookupPort, InvitationsContextPort, InvitationsRepositoryPort } from "../domain/ports/out/invitations.ports.js";

const ORG = mintOrganizationId("org-a");
const RH = { email: "rh@demo.invalid" };

class FakeRepo implements InvitationsRepositoryPort {
  items: (Invitation & { codeHash: string })[] = [];
  reqs: JoinRequest[] = [];
  async list() {
    return this.items.map(({ codeHash: _h, ...i }) => ({ ...i }));
  }
  async get(_o: OrganizationId, id: string) {
    const i = this.items.find((x) => x.id === id);
    if (!i) return null;
    const { codeHash: _h, ...rest } = i;
    return { ...rest };
  }
  async create(_o: OrganizationId, i: { codeHash: string; codeHint: string; locationId: string | null; departmentId: string | null; maxUses: number | null; expiresAt: string }, by: string) {
    const row = { ...i, id: `i${this.items.length + 1}`, uses: 0, status: "active" as const, createdBy: by, createdAt: "2026-10-12T10:00:00.000Z", revokedAt: null };
    this.items.push(row);
    const { codeHash: _h, ...out } = row;
    return out;
  }
  async revoke(_o: OrganizationId, id: string, at: string) {
    Object.assign(this.items.find((x) => x.id === id)!, { status: "revoked", revokedAt: at });
  }
  async consumeUse(_o: OrganizationId, id: string) {
    const i = this.items.find((x) => x.id === id)!;
    if (i.maxUses !== null && i.uses >= i.maxUses) return false;
    i.uses += 1;
    return true;
  }
  async listRequests() {
    return this.reqs.map((r) => ({ ...r }));
  }
  async getRequest(_o: OrganizationId, id: string) {
    const r = this.reqs.find((x) => x.id === id);
    return r ? { ...r } : null;
  }
  async createRequest(_o: OrganizationId, r: { invitationId: string; firstName: string; lastName: string; email: string; possibleDuplicate: boolean }) {
    const row: JoinRequest = { ...r, id: `r${this.reqs.length + 1}`, status: "pending", rejectReason: null, decidedBy: null, decidedAt: null, employeeId: null, createdAt: "2026-10-12T11:00:00.000Z" };
    this.reqs.push(row);
    return { ...row };
  }
  async decide(_o: OrganizationId, id: string, from: JoinRequest["status"], patch: Partial<JoinRequest>) {
    const r = this.reqs.find((x) => x.id === id);
    if (!r || r.status !== from) return false;
    Object.assign(r, patch);
    return true;
  }
}

class FakeCodes implements InvitationCodesPort {
  n = 0;
  generate() {
    return `ABCDEF${String(++this.n).padStart(4, "0")}`;
  }
  hash(code: string) {
    return `h:${code}`;
  }
}

function setup(now = "2026-10-12T12:00:00.000Z") {
  const repo = new FakeRepo();
  const lookup: InvitationLookupPort = { findByCodeHash: async (h) => (repo.items.find((i) => i.codeHash === h) ? { organizationId: ORG, invitationId: repo.items.find((i) => i.codeHash === h)!.id } : null) };
  const audits: string[] = [];
  const ctx: InvitationsContextPort = {
    employeeByEmail: async (_o, email) => (email === "ana@demo.invalid" ? "e-ana" : null),
    now: () => now,
    audit: async (_o, e) => void audits.push(e.action),
  };
  const clock = { now };
  const uc = new InvitationsUseCases(repo, new FakeCodes(), lookup, { ...ctx, now: () => clock.now });
  return { uc, repo, audits, clock };
}

describe("Convites e adesões (FE-054)", () => {
  test("código completo só na criação; lista mascarada; o hash é o que fica guardado", async () => {
    const { uc, repo, audits } = setup();
    const { code, invitation } = await uc.create(ORG, RH, { locationId: "porto", departmentId: null, expiresInDays: 14, maxUses: 2 });
    expect(code).toBe("ABCDEF0001");
    expect(invitation).toMatchObject({ maskedCode: "••••••0001", state: "active", expiresAt: "2026-10-26T12:00:00.000Z" });
    expect(repo.items[0]!.codeHash).toBe("h:ABCDEF0001");
    expect(JSON.stringify(await uc.list(ORG))).not.toContain("ABCDEF0001");
    expect(audits).toEqual(["invitations.create"]);
    await expect(uc.create(ORG, RH, { locationId: null, departmentId: null, expiresInDays: 0, maxUses: null })).rejects.toMatchObject({ field: "expiresInDays" });
  });

  test("pedido público: dados mínimos, esgota as utilizações; inválido/expirado/revogado dão a mesma resposta", async () => {
    const { uc, clock } = setup();
    const { code, invitation } = await uc.create(ORG, RH, { locationId: null, departmentId: null, expiresInDays: 1, maxUses: 1 });
    await expect(uc.submit(code, { firstName: "", lastName: "Demo", email: "x@demo.invalid" })).rejects.toMatchObject({ field: "firstName" });
    expect(await uc.check(code.toLowerCase())).toMatchObject({ valid: true });
    expect(await uc.submit(code, { firstName: " Ana ", lastName: "Demo", email: "ANA@demo.invalid" })).toEqual({ received: true });
    const esgotado = uc.submit(code, { firstName: "Rui", lastName: "Demo", email: "rui@demo.invalid" });
    const inexistente = uc.submit("ZZZZZZZZZZ", { firstName: "Rui", lastName: "Demo", email: "rui@demo.invalid" });
    const [a, b] = await Promise.allSettled([esgotado, inexistente]);
    expect(a.status === "rejected" && b.status === "rejected" && (a.reason as Error).message === (b.reason as Error).message).toBe(true);
    const second = await uc.create(ORG, RH, { locationId: null, departmentId: null, expiresInDays: 1, maxUses: null });
    await uc.revoke(ORG, RH, second.invitation.id);
    await expect(uc.check(second.code)).rejects.toMatchObject({ code: "invalid_invitation" });
    clock.now = "2026-10-14T12:00:00.000Z";
    expect((await uc.list(ORG)).find((i) => i.id === invitation.id)!.state).toBe("expired");
  });

  test("aceitar pré-preenche com o centro do convite e o duplicado; concluir liga a ficha; recusar pede motivo; 409 se já tratado", async () => {
    const { uc, repo } = setup();
    const { code } = await uc.create(ORG, RH, { locationId: "porto", departmentId: "cozinha", expiresInDays: 7, maxUses: null });
    await uc.submit(code, { firstName: "Ana", lastName: "Demo", email: "ana@demo.invalid" });
    await uc.submit(code, { firstName: "Rui", lastName: "Demo", email: "rui@demo.invalid" });
    const [ana, rui] = repo.reqs;
    expect(ana!.possibleDuplicate).toBe(true);
    expect(await uc.prefill(ORG, ana!.id)).toEqual({ requestId: ana!.id, firstName: "Ana", lastName: "Demo", email: "ana@demo.invalid", locationId: "porto", departmentId: "cozinha", existingEmployeeId: "e-ana" });
    await uc.complete(ORG, RH, rui!.id, "e-rui");
    expect(repo.reqs[1]).toMatchObject({ status: "accepted", employeeId: "e-rui" });
    await expect(uc.reject(ORG, RH, rui!.id, "Duplicado")).rejects.toMatchObject({ code: "conflict" });
    await expect(uc.reject(ORG, RH, ana!.id, "x")).rejects.toMatchObject({ field: "reason" });
    await uc.reject(ORG, RH, ana!.id, "Já trabalha connosco");
    expect((await uc.requests(ORG))[0]).toMatchObject({ status: "rejected", rejectReason: "Já trabalha connosco", invitationState: "active" });
  });

  test("limite por IP: a partir do máximo responde 429 até acabar a janela", () => {
    let t = 0;
    const mw = ipRateLimit(2, 1000, () => t);
    const calls: unknown[] = [];
    const go = () => mw({ ip: "1.1.1.1" } as never, {} as never, (e?: unknown) => calls.push(e ?? "ok"));
    go();
    go();
    go();
    expect(calls.slice(0, 2)).toEqual(["ok", "ok"]);
    expect((calls[2] as { problem: { status: number } }).problem.status).toBe(429);
    t = 1001;
    go();
    expect(calls[3]).toBe("ok");
  });
});
