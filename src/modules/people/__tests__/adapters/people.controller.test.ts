import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { InMemoryIdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problemHandler } from "../../../../infra/http/problem-details.js";
import { PeopleController } from "../../adapters/in/people.controller.js";
import { EmploymentUseCases } from "../../application/use-cases/employment.use-cases.js";
import { PeopleUseCases } from "../../application/use-cases/people.use-cases.js";
import { FakePeopleRepo, viewer } from "../fakes/fake-people.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

describe("API /api/novo-rh/people", () => {
  let server: Server;
  let base: string;
  let n = 0;
  const repo = new FakePeopleRepo();

  beforeAll(async () => {
    const audit = { record: async () => undefined };
    const clock = { today: async () => "2026-10-11" };
    const people = new PeopleUseCases(repo, { disableLinkedUser: async () => undefined }, audit, clock);
    const employment = new EmploymentUseCases(repo, audit, clock);
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = { sub: "u1", email: "rh@demo.invalid", orgId: mintOrganizationId("org-a"), orgRole: "admin" };
      next();
    });
    app.use("/api", new PeopleController(people, employment, new InMemoryIdempotencyStore(), async () => viewer({ hidden: ["identification.iban"] })).router);
    app.use(problemHandler);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/novo-rh/people`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", "Idempotency-Key": `k${++n}`, ...headers }, ...(body !== undefined && { body: JSON.stringify(body) }) });

  test("criar → 201 com ETag; duplicado → 409 duplicate_document; sem apelido → 400 com campo", async () => {
    const ok = await send("POST", "", { firstName: "Ana", lastName: "Demo", nif: "123456789", hireDate: "2026-10-01", primaryLocationId: "PRT" });
    expect(ok.status).toBe(201);
    expect(ok.headers.get("etag")).toBeTruthy();
    const dup = await send("POST", "", { firstName: "Bia", lastName: "Demo", nif: "123456789", hireDate: "2026-10-01", primaryLocationId: "PRT" });
    expect(dup.status).toBe(409);
    expect((await dup.json()).type).toBe("/problems/duplicate_document");
    const noLast = await send("POST", "", { firstName: "Bia", nif: "987654321", hireDate: "2026-10-01", primaryLocationId: "PRT" });
    expect(noLast.status).toBe(400);
    expect((await noLast.json()).field).toBe("lastName");
  });

  test("editar com If-Match desatualizado → 412; campo sem permissão → 403", async () => {
    const id = repo.employees[0]!.id;
    const get = await fetch(`${base}/${id}`);
    const etag = get.headers.get("etag")!;
    const ok = await send("PATCH", `/${id}`, { phone: "910000000" }, { "If-Match": etag });
    expect(ok.status).toBe(200);
    expect((await send("PATCH", `/${id}`, { phone: "920000000" }, { "If-Match": etag })).status).toBe(412);
    const forbidden = await send("PATCH", `/${id}`, { iban: "PT50000201231234567890154", reason: "x" }, { "If-Match": ok.headers.get("etag")! });
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).field).toBe("iban");
  });

  test("RE_3_http_exportacao_sem_coluna_iban_para_quem_nao_a_ve", async () => {
    const res = await fetch(`${base}/export.csv`);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain("NIF");
    expect(text).not.toContain("IBAN");
  });

  test("catálogos de centros e cargos do Novo RH (também em modo Demonstração)", async () => {
    const catalog = base.replace("/people", "/catalog");
    const loc = await (await fetch(`${catalog}/locations`, { headers: { "Idempotency-Key": "c1" } })).json();
    expect(loc.map((l: { code: string }) => l.code)).toEqual(["PRT", "BRG"]);
    const pos = await (await fetch(`${catalog}/positions`, { headers: { "Idempotency-Key": "c2" } })).json();
    expect(pos).toEqual([{ id: "pos-op", name: "Operador" }]);
  });
});
