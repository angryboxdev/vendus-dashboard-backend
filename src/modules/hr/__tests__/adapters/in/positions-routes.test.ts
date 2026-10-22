import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { classifyRoute } from "../../../../access/domain/route-permissions.js";

// Mesmo padrão de `update-work-shift-route.test.ts`: Express real + http.Server + fetch.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

jest.mock("../../../../../middleware/auth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireMinRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { HrPositionsController } = require("../../../adapters/in/hr-positions.controller.js") as typeof import("../../../adapters/in/hr-positions.controller.js");

/**
 * Cargos no Novo RH (Configurações → Estrutura): os mesmos handlers em
 * `/novo-rh/positions` — é aí que o modo Demonstração se aplica (o cabeçalho
 * só vale em `/api/novo-rh/*`); `/hr/positions` mantém-se até à fase 4 do ADR-0040.
 */
describe("Cargos — /hr/positions e /novo-rh/positions", () => {
  let server: Server;
  const calls: string[] = [];

  beforeAll(async () => {
    // Dados fictícios (RGPD).
    const position = { id: "p1", name: "Gerente de loja", description: null, active: true, employeeCount: 2, updatedAt: "2026-10-22T10:00:00Z" };
    const controller = new HrPositionsController(
      { execute: async () => (calls.push("list"), [position]) },
      { execute: async (c: { name: string }) => (calls.push(`create:${c.name}`), { ...position, name: c.name }) },
      { execute: async (c: { id: string }) => (calls.push(`update:${c.id}`), position) },
      { execute: async (c: { id: string; active: boolean }) => (calls.push(`active:${c.id}:${c.active}`), { ...position, active: c.active }) },
    );
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { auth: unknown }).auth = { orgId: "org-a", email: "gestor@demo.invalid", sub: "u1" };
      next();
    });
    app.use(controller.router);
    server = app.listen(0);
  });
  afterAll(() => new Promise<void>((done) => server.close(() => done())));

  const url = (path: string) => `http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`;
  const send = (method: string, path: string, body?: unknown) =>
    fetch(url(path), { method, headers: { "Content-Type": "application/json" }, ...(body !== undefined && { body: JSON.stringify(body) }) });

  test("os dois caminhos usam os mesmos casos de uso", async () => {
    expect((await (await send("GET", "/novo-rh/positions")).json())[0].name).toBe("Gerente de loja");
    expect((await send("POST", "/novo-rh/positions", { name: "Chefe de sala" })).status).toBe(201);
    expect((await send("PATCH", "/novo-rh/positions/p1", { name: "Gerente" })).status).toBe(200);
    expect((await send("PATCH", "/novo-rh/positions/p1/active", { active: false })).status).toBe(200);
    expect((await send("GET", "/hr/positions")).status).toBe(200);
    expect(calls).toEqual(["list", "create:Chefe de sala", "update:p1", "active:p1:false", "list"]);
  });

  test("permissão: company.positions (ler e gerir) nos dois caminhos", () => {
    expect(classifyRoute("GET", "/api/novo-rh/positions")).toEqual({ target: { kind: "permission", key: "company.positions" }, level: "READ" });
    expect(classifyRoute("PATCH", "/api/novo-rh/positions/p1/active").level).toBe("MANAGE");
    expect(classifyRoute("POST", "/api/hr/positions").target).toEqual({ kind: "permission", key: "company.positions" });
  });
});
