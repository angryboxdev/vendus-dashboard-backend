import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { problemHandler } from "../../../../infra/http/problem-details.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { createDashboardRouter } from "../../adapters/in/dashboard.controller.js";
import { MemoryDashboardCache } from "../../adapters/out/memory-dashboard-cache.js";
import { DashboardUseCases } from "../../application/use-cases/dashboard.use-cases.js";
import { FakeLayouts, FakeSources, FakeViewer, person } from "../fakes/fake-dashboard.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

describe("API /api/novo-rh/dashboard", () => {
  let server: Server;
  let base: string;
  beforeEach(async () => {
    const uc = new DashboardUseCases(new FakeSources(), new FakeLayouts(), new MemoryDashboardCache());
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = { sub: "u-boss", email: "gestora@demo.invalid", orgId: mintOrganizationId("org-a"), orgRole: "admin" };
      next();
    });
    app.use("/api", createDashboardRouter(uc, async () => new FakeViewer("u-boss", [person({ employeeId: "e1" })])));
    app.use(problemHandler);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/novo-rh/dashboard`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("snapshot com Server-Timing e sem cache HTTP; categoria inválida 400; aniversários sem permissão 403", async () => {
    const r = await fetch(`${base}/snapshot`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("server-timing")).toMatch(/snapshot;dur=\d+/);
    expect((await r.json()).team.working).toBe(1);
    expect((await fetch(`${base}/team?category=working`)).status).toBe(200);
    expect((await fetch(`${base}/team?category=xpto`)).status).toBe(400);
    expect((await fetch(`${base}/birthdays`)).status).toBe(403);
  });

  test("layout: PUT guarda só metadados válidos, DELETE restaura o padrão", async () => {
    const put = await fetch(`${base}/layout`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ widgets: [{ widgetId: "TEAM_STATUS", order: 0, span: 12, hidden: false }] }) });
    expect(put.status).toBe(200);
    expect((await put.json()).custom).toBe(true);
    const bad = await fetch(`${base}/layout`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ widgets: [{ widgetId: "TEAM_STATUS", span: 5 }] }) });
    expect(bad.status).toBe(400);
    expect((await (await fetch(`${base}/layout`, { method: "DELETE" })).json()).custom).toBe(false);
  });
});
