import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { InMemoryIdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problemHandler } from "../../../../infra/http/problem-details.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { demoContext } from "../../adapters/in/demo-context.middleware.js";
import { createDemoOrgRouter } from "../../adapters/in/demo-org.controller.js";
import { DemoOrgUseCases } from "../../application/use-cases/demo-org.use-cases.js";
import { FakeDemoLive, FakeDemoOrgRepository, FakeDemoScenario, FakeDemoSeeder, FakeDemoSupport } from "../fakes/fake-demo-org.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

describe("Modo Demonstração — /api/novo-rh/demo e cabeçalho X-Novo-RH-Mode", () => {
  let server: Server;
  let base: string;
  let n = 0;
  let isAdmin = true;

  beforeEach(async () => {
    isAdmin = true;
    const live = new FakeDemoLive();
    const uc = new DemoOrgUseCases(new FakeDemoOrgRepository(), new FakeDemoSeeder(), new FakeDemoSupport(), live, new FakeDemoScenario(live));
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = { sub: "u-1", email: "admin@demo.invalid", orgId: mintOrganizationId("org-real"), orgRole: "admin" };
      (req as unknown as { access: { isAdmin: boolean } }).access = { isAdmin };
      next();
    });
    app.use(demoContext((org) => uc.resolve(org)));
    app.use("/api", createDemoOrgRouter(uc, new InMemoryIdempotencyStore()));
    // Eco da organização efetiva, dentro e fora do Novo RH.
    app.get("/api/novo-rh/echo", (req, res) => res.json({ org: req.auth!.orgId }));
    app.get("/api/locations", (req, res) => res.json({ org: req.auth!.orgId }));
    app.use(problemHandler);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const demo = { "X-Novo-RH-Mode": "demo" };
  const create = () => fetch(`${base}/novo-rh/demo`, { method: "POST", headers: { ...demo, "Idempotency-Key": `k-${++n}` } });
  const echo = async (path: string, headers: Record<string, string> = {}) => (await (await fetch(`${base}${path}`, { headers })).json()).org;

  test("sem organização demo: 409 demo_not_created; modo Real fica na organização real", async () => {
    expect(await echo("/novo-rh/echo")).toBe("org-real");
    const r = await fetch(`${base}/novo-rh/echo`, { headers: demo });
    expect(r.status).toBe(409);
    expect((await r.json()).type).toBe("/problems/demo_not_created");
  });

  test("depois de criar: Novo RH age na demo; resto da API e modo Real continuam na real", async () => {
    const c = await create();
    expect(c.status).toBe(201);
    expect((await c.json()).exists).toBe(true);
    const r = await fetch(`${base}/novo-rh/echo`, { headers: demo });
    expect(r.headers.get("x-novo-rh-mode")).toBe("demo");
    expect((await r.json()).org).not.toBe("org-real");
    expect(await echo("/locations", demo)).toBe("org-real");
    expect(await echo("/novo-rh/echo")).toBe("org-real");
    // O estado lê-se sempre a partir da organização real, mesmo com o cabeçalho.
    expect(await (await fetch(`${base}/novo-rh/demo`, { headers: demo })).json()).toMatchObject({ exists: true });
    expect((await create()).status).toBe(409);
  });

  test("atualizar dados fictícios: um pedido com Idempotency-Key responde 200 (não 409 'ainda a ser processado')", async () => {
    expect((await create()).status).toBe(201);
    const r = await fetch(`${base}/novo-rh/demo/refresh`, { method: "POST", headers: { ...demo, "Idempotency-Key": `k-${++n}` } });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ skipped: false });
  });

  test("refresh repetido pela rede (mesma Idempotency-Key) nunca dá 409; o estado mostra a última atualização", async () => {
    expect((await create()).status).toBe(201);
    const send = () => fetch(`${base}/novo-rh/demo/refresh`, { method: "POST", headers: { ...demo, "Idempotency-Key": "k-repetida" } });
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.status, b.status].every((x) => x === 200)).toBe(true);
    const st = await (await fetch(`${base}/novo-rh/demo`)).json();
    expect(st.refresh.lastAt).not.toBeNull();
    expect(st.refresh.error).toBeNull();
  });

  test("não-Admin: não cria e não entra em modo Demonstração", async () => {
    isAdmin = false;
    expect((await create()).status).toBe(403);
    const r = await fetch(`${base}/novo-rh/echo`, { headers: demo });
    expect(r.status).toBe(403);
    expect((await r.json()).type).toBe("/problems/demo_admin_only");
  });
});
