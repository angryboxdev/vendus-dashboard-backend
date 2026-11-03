import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { InMemoryIdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problemHandler } from "../../../../infra/http/problem-details.js";
import { dec } from "../../../../kernel/money/decimal.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { createInvoicingRouter } from "../../adapters/in/invoicing.controller.js";
import { InvoicingUseCases } from "../../application/use-cases/invoicing.use-cases.js";
import { IssueDocumentUseCase } from "../../application/use-cases/issue-document.use-case.js";
import { FakeInvoicingStore, FakeIssuers, FakeSigner, FixedClock } from "../fakes/fakes.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

const ORG = mintOrganizationId("b6999cff-79b2-4583-b8b4-a744b3ace748");
const NOW = { systemEntryDate: "2027-03-10T12:00:00", date: "2027-03-10", instant: "2027-03-10T12:00:00.000Z" };

let server: Server;
let base: string;
let store: FakeInvoicingStore;

beforeAll(async () => {
  store = new FakeInvoicingStore();
  const deps = { store, certificateNumber: null, simplifiedInvoiceLimitNet: dec("100") };
  const uc = new InvoicingUseCases({ ...deps, signingAvailable: true });
  const issue = new IssueDocumentUseCase({ ...deps, signer: new FakeSigner(), clock: new FixedClock(NOW), issuers: new FakeIssuers() });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { sub: "u1", email: "ana@demo.invalid", orgId: ORG, orgRole: "admin" };
    next();
  });
  app.use("/api", createInvoicingRouter(uc, issue, new InMemoryIdempotencyStore()));
  app.use(problemHandler);
  server = await new Promise<Server>((r) => {
    const s = app.listen(0, () => r(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/invoicing`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), ...headers }, body: JSON.stringify(body) });

const line = { productCode: "PZ01", productType: "P", unit: "UN", description: "Pizza", quantity: "2", unitPrice: "12.50", tax: { region: "PT", rate: "INT" } };

describe("API /api/invoicing", () => {
  let seriesRef: string;

  it("cria série, regista o código da AT e emite (201)", async () => {
    const s = await post("/series", { legalEntityId: "22222222-2222-4222-8222-222222222222", documentType: "FS", seriesId: "L01-2027", mode: "training" });
    expect(s.status).toBe(201);
    seriesRef = (await s.json()).ref;

    const code = await fetch(`${base}/series/${seriesRef}/validation-code`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ validationCode: "CDF7T5HD" }) });
    expect(code.status).toBe(204);

    const doc = await post("/documents", { seriesRef, lines: [line] }, { "Idempotency-Key": "emissao-teste-0001" });
    expect(doc.status).toBe(201);
    expect(await doc.json()).toEqual({ documentId: "doc-1", documentNumber: "FS L01-2027/1", atcud: "CDF7T5HD-1" });
    expect(store.saved[0]!.actor).toBe("ana@demo.invalid");
  });

  it("repetir o pedido com a mesma Idempotency-Key não emite outro documento", async () => {
    const again = await post("/documents", { seriesRef, lines: [line] }, { "Idempotency-Key": "emissao-teste-0001" });
    expect(again.status).toBe(201);
    expect(store.saved).toHaveLength(1);
  });

  it("regra fiscal violada → 422; série inexistente → 404; corpo inválido → 400", async () => {
    expect((await post("/documents", { seriesRef, lines: [{ ...line, quantity: "20" }] })).status).toBe(422);
    expect((await post("/documents", { seriesRef: "99999999-9999-4999-8999-999999999999", lines: [line] })).status).toBe(404);
    expect((await post("/documents", { seriesRef: "nao-e-uuid", lines: [line] })).status).toBe(400);
    expect((await post("/documents", { seriesRef, lines: "x" })).status).toBe(400);
  });

  it("avisos de data futura → 409 com os avisos; confirmados → 201", async () => {
    const r = await post("/documents", { seriesRef, documentDate: "2027-03-11", lines: [line] });
    expect(r.status).toBe(409);
    expect((await r.json()).warnings).toEqual(["future-document-date"]);
    expect((await post("/documents", { seriesRef, documentDate: "2027-03-11", confirmWarnings: true, lines: [line] })).status).toBe(201);
  });

  it("anular pede motivo da lista fechada", async () => {
    expect((await post("/documents/11111111-1111-4111-8111-111111111111/cancel", { reasonCode: "not-delivered" })).status).toBe(204);
    expect((await post("/documents/11111111-1111-4111-8111-111111111111/cancel", { reasonCode: "x" })).status).toBe(422);
  });

  it("configuração e listas", async () => {
    expect((await (await fetch(`${base}/meta`)).json())).toMatchObject({ certified: false, certificateNumber: "0" });
    expect(await (await fetch(`${base}/series`)).json()).toHaveLength(1);
    expect((await fetch(`${base}/documents/99999999-9999-4999-8999-999999999999`)).status).toBe(404);
    expect((await fetch(`${base}/documents/nao-e-uuid`)).status).toBe(400);
  });
});
