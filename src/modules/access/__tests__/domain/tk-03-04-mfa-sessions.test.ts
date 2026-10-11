import type { Request, Response } from "express";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { createAccessGuards } from "../../adapters/in/access-guards.js";
import type { AccessContext, ResolveAccessPort } from "../../domain/ports/in/resolve-access.port.js";
import { mfaRequired, sessionRevoked, type RouteSubject } from "../../domain/route-permissions.js";

const ORG = mintOrganizationId("org-a");
const admin: RouteSubject = { isAdmin: true, active: true, portalOnly: false, permissions: {} };
const reader: RouteSubject = { isAdmin: false, active: true, portalOnly: false, permissions: { "hr.employees": "READ" } };
const manager: RouteSubject = { isAdmin: false, active: true, portalOnly: false, permissions: { "hr.schedules": "MANAGE" } };
const employee: RouteSubject = { isAdmin: false, active: true, portalOnly: true, permissions: {} };

function ctx(over: Partial<AccessContext> = {}): AccessContext {
  return {
    userId: "u1",
    profile: { id: "p", name: "Admin", systemKey: "admin" },
    isAdmin: true,
    portalOnly: false,
    active: true,
    sessionsRevokedAt: null,
    permissions: {},
    overrides: {},
    modules: [],
    ...over,
  };
}

async function run(handler: (req: Request, res: Response, next: () => void) => unknown, req: Partial<Request>) {
  let status = 200;
  let body: unknown;
  let passed = false;
  const res = {
    status(s: number) {
      status = s;
      return res;
    },
    type() {
      return res;
    },
    json(b: unknown) {
      body = b;
      return res;
    },
  } as unknown as Response;
  await handler({ originalUrl: "/api/novo-rh/settings/profiles", method: "GET", ...req } as Request, res, () => {
    passed = true;
  });
  return { status, body, passed };
}

describe("TK-3 — MFA obrigatória para perfis de gestão", () => {
  test("TK_3_regra_quem_e_onde_se_exige_mfa", () => {
    expect(mfaRequired(admin, "/api/novo-rh/settings", "novo-rh")).toBe(true);
    expect(mfaRequired(manager, "/api/novo-rh/structure/groups", "novo-rh")).toBe(true);
    expect(mfaRequired(reader, "/api/novo-rh/settings", "novo-rh")).toBe(false); // só leitura
    expect(mfaRequired(admin, "/api/hr/people", "novo-rh")).toBe(false); // fora do Novo RH
    expect(mfaRequired(admin, "/api/hr/people", "all")).toBe(true);
    expect(mfaRequired(admin, "/api/me/access", "all")).toBe(false); // Portal / acesso próprio
    expect(mfaRequired(employee, "/api/novo-rh/settings", "all")).toBe(false);
    expect(mfaRequired(admin, "/api/novo-rh/settings", "off")).toBe(false);
  });

  test("TK_3_admin_sem_mfa_nao_acede_as_rotas_de_administracao", async () => {
    const guards = createAccessGuards({} as ResolveAccessPort, { mfa: "novo-rh" });
    const base = { auth: { sub: "u1", email: "a", orgId: ORG, orgRole: "admin" as const }, access: ctx() };
    const without = await run(guards.requireMfa, { ...base, auth: { ...base.auth, aal: "aal1" } });
    expect(without).toMatchObject({ status: 403, passed: false, body: { type: "/problems/mfa_required", code: "MFA_REQUIRED" } });
    const withMfa = await run(guards.requireMfa, { ...base, auth: { ...base.auth, aal: "aal2" } });
    expect(withMfa.passed).toBe(true);
  });
});

describe("TK-4 — sessões revogadas", () => {
  test("TK_4_token_emitido_antes_da_revogacao_deixa_de_valer", async () => {
    const revokedAt = "2026-10-11T12:00:00.000Z";
    const before = Date.parse(revokedAt) / 1000 - 60;
    const after = Date.parse(revokedAt) / 1000 + 60;
    expect(sessionRevoked(revokedAt, before)).toBe(true);
    expect(sessionRevoked(revokedAt, after)).toBe(false);
    expect(sessionRevoked(null, before)).toBe(false);
    expect(sessionRevoked(revokedAt, undefined)).toBe(true);

    const resolve: ResolveAccessPort = { execute: async () => ctx({ sessionsRevokedAt: revokedAt }), invalidate: () => undefined };
    const guards = createAccessGuards(resolve);
    const auth = { sub: "u1", email: "a", orgId: ORG, orgRole: "admin" as const };
    const old = await run(guards.loadAccess, { auth: { ...auth, issuedAt: before } });
    expect(old).toMatchObject({ status: 401, passed: false, body: { code: "SESSION_REVOKED" } });
    expect((await run(guards.loadAccess, { auth: { ...auth, issuedAt: after } })).passed).toBe(true);
  });
});
