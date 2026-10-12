import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { problemHandler } from "../../../../infra/http/problem-details.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { createOverviewRouter } from "../../adapters/in/overview.controller.js";
import { OverviewUseCases } from "../../application/use-cases/overview.use-cases.js";
import { FakeOverviewSources } from "../fakes/fake-overview.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

describe("API /api/novo-rh/overview", () => {
  let server: Server;
  let base: string;

  beforeEach(async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.auth = { sub: "u-1", email: "admin@demo.invalid", orgId: mintOrganizationId("org-a"), orgRole: "admin" };
      next();
    });
    app.use("/api", createOverviewRouter(new OverviewUseCases(new FakeOverviewSources()), () => ({ canSee: async () => true, canPrivate: false })));
    app.use(problemHandler);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/novo-rh/overview`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("devolve o painel de hoje sem cache no browser; data inválida → 400", async () => {
    const ok = await fetch(base);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    const body = await ok.json();
    expect(body.kpis.people).toBe(4);
    expect(body.people[0]).toHaveProperty("week");
    const bad = await fetch(`${base}?date=amanha`);
    expect(bad.status).toBe(400);
    expect((await bad.json()).type).toBe("/problems/validation_error");
  });
});
