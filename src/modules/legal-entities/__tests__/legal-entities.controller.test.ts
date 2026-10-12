import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { InMemoryIdempotencyStore } from "../../../infra/http/idempotency.js";
import { problemHandler } from "../../../infra/http/problem-details.js";
import { mintOrganizationId } from "../../../kernel/organization-id.js";
import { createLegalEntitiesRouter } from "../adapters/in/legal-entities.controller.js";
import { LegalEntitiesUseCases } from "../application/use-cases/legal-entities.use-cases.js";
import { FakeLegalCtx, FakeLegalRepo, PT } from "./fakes.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

describe("API /api/novo-rh/legal-entities", () => {
  let server: Server;
  let base: string;
  let n = 0;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = { sub: "u-rh", email: "rh@demo.invalid", orgId: mintOrganizationId("org-a"), orgRole: "admin" };
      next();
    });
    app.use("/api", createLegalEntitiesRouter(new LegalEntitiesUseCases(new FakeLegalRepo(), new FakeLegalCtx()), new InMemoryIdempotencyStore()));
    app.use(problemHandler);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/novo-rh/legal-entities`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const send = (method: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", "Idempotency-Key": `k-${++n}`, ...headers }, body: JSON.stringify(body) });

  test("criar devolve ETag; editar sem If-Match é 428, desatualizado é 412, com a versão certa grava", async () => {
    const created = await (await send("POST", "", PT)).json();
    expect(created.etag).toBeTruthy();
    expect((await send("PATCH", `/${created.id}`, { city: "Gaia", reason: "Mudança de sede" })).status).toBe(428);
    expect((await send("PATCH", `/${created.id}`, { city: "Gaia", reason: "Mudança de sede" }, { "If-Match": '"velho"' })).status).toBe(412);
    const ok = await send("PATCH", `/${created.id}`, { city: "Gaia", reason: "Mudança de sede" }, { "If-Match": created.etag });
    expect(ok.status).toBe(200);
    expect((await ok.json()).city).toBe("Gaia");
  });

  test("erro de validação no campo e NIF duplicado com a entidade existente", async () => {
    const bad = await send("POST", "", { ...PT, taxId: "123456780" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).field).toBe("taxId");
    const dup = await send("POST", "", PT);
    expect(dup.status).toBe(409);
    expect((await dup.json()).existingId).toBeTruthy();
  });
});
