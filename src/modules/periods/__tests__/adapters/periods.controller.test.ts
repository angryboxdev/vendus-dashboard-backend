import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { InMemoryIdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problemHandler } from "../../../../infra/http/problem-details.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { createPeriodsRouter } from "../../adapters/in/periods.controller.js";
import { PeriodsUseCases } from "../../application/use-cases/periods.use-cases.js";
import { FakePeriodsAudit, FakePeriodsContext, FakePeriodsRepository, FakeSupport } from "../fakes/fake-periods.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

describe("API /api/novo-rh/periods", () => {
  let server: Server;
  let base: string;
  let n = 0;
  let ctx: FakePeriodsContext;
  let support: FakeSupport;
  let sensitive = false;

  beforeEach(async () => {
    ctx = new FakePeriodsContext();
    support = new FakeSupport();
    sensitive = false;
    const uc = new PeriodsUseCases(new FakePeriodsRepository(), ctx, support, new FakePeriodsAudit());
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = { sub: "u-rh1", email: "rh1@demo.invalid", orgId: mintOrganizationId("org-a"), orgRole: "admin" };
      next();
    });
    app.use("/api", createPeriodsRouter(uc, new InMemoryIdempotencyStore(), () => sensitive));
    app.use(problemHandler);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/novo-rh/periods`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": `k-${++n}` }, body: JSON.stringify(body) });

  test("fecho com pendentes → 409 com a lista; exportação e download com link que expira (410)", async () => {
    const p = await (await post("", { scopeType: "organization", startDate: "2026-10-01", endDate: "2026-10-31" })).json();
    ctx.pending = [{ type: "absence_request", id: "a1", employeeId: "e1", date: "2026-10-10", label: "Ausência pendente" }];
    const blocked = await post(`/${p.id}/close`, {});
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).pending).toHaveLength(1);
    expect((await post(`/${p.id}/close`, { exceptionReason: "Aprovada fora do sistema" })).status).toBe(200);
    // Pedir NIF sem a permissão: o pedido é aceite, mas sem a coluna.
    const job = await (await post(`/${p.id}/exports`, { kind: "payroll", includeSensitive: true })).json();
    expect(job.includeSensitive).toBe(false);
    await support.flush();
    const link = await (await fetch(`${base}/exports/${job.id}/link`)).json();
    const file = await fetch(`${base}/exports/${job.id}/download?token=${link.token}`);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toContain("text/csv");
    expect(file.headers.get("cache-control")).toBe("no-store");
    support.nowValue = "2026-11-05T00:00:00.000Z";
    expect((await fetch(`${base}/exports/${job.id}/download?token=${link.token}`)).status).toBe(410);
  });
});
