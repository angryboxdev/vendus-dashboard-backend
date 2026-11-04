import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { InMemoryIdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problemHandler } from "../../../../infra/http/problem-details.js";
import { dec } from "../../../../kernel/money/decimal.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { createInvoicingRouter } from "../../adapters/in/invoicing.controller.js";
import { AtCommunicationUseCases } from "../../application/use-cases/at-communication.use-cases.js";
import { InvoicingUseCases } from "../../application/use-cases/invoicing.use-cases.js";
import { IssueDocumentUseCase } from "../../application/use-cases/issue-document.use-case.js";
import { efaturaResponse, FakeAtCredentials, FakeAtGateway, FakeAtStore } from "../fakes/at-fakes.js";
import { FakeInvoicingStore, FakeIssuers, FakeSigner, FixedClock } from "../fakes/fakes.js";
import { storedDoc } from "../fixtures/stored-documents.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

const ORG = mintOrganizationId("b6999cff-79b2-4583-b8b4-a744b3ace748");
const NOW = { systemEntryDate: "2027-03-10T12:00:00", date: "2027-03-10", instant: "2027-03-10T12:00:00.000Z" };
const LE = "22222222-2222-4222-8222-222222222222";

let server: Server;
let base: string;
const credentials = new FakeAtCredentials();
const atStore = new FakeAtStore();
const gateway = new FakeAtGateway();

beforeAll(async () => {
  const store = new FakeInvoicingStore();
  store.getDocument = async () => storedDoc({ id: "11111111-1111-4111-8111-111111111111" });
  const deps = { store, certificateNumber: null, simplifiedInvoiceLimitNet: dec("100") };
  const uc = new InvoicingUseCases({ ...deps, signingAvailable: true, issuers: new FakeIssuers(), clock: new FixedClock(NOW), software: { productName: "Mezza", producerTaxId: null, producerName: null, version: "1.0.0" } });
  const issue = new IssueDocumentUseCase({ ...deps, signer: new FakeSigner(), clock: new FixedClock(NOW), issuers: new FakeIssuers() });
  const at = new AtCommunicationUseCases({ store, at: atStore, credentials, gateway, environment: "test", issuers: new FakeIssuers(), clock: new FixedClock(NOW), certificateNumber: null });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { sub: "u1", email: "ana@demo.invalid", orgId: ORG, orgRole: "admin" };
    next();
  });
  app.use("/api", createInvoicingRouter(uc, issue, new InMemoryIdempotencyStore(), at));
  app.use(problemHandler);
  server = await new Promise<Server>((r) => {
    const s = app.listen(0, () => r(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/invoicing/at`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const send = (method: string, path: string, body?: unknown) =>
  fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("API /api/invoicing/at", () => {
  it("credenciais: gravadas (a resposta e o estado não trazem a senha)", async () => {
    const put = await send("PUT", `/credentials/${LE}`, { username: "599999999/37", password: "senha-ficticia" });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ legalEntityId: LE, username: "599999999/37" });
    const status = await (await send("GET", "")).json();
    expect(status).toMatchObject({ configured: true, environment: "test", credentials: [{ legalEntityId: LE, username: "599999999/37" }] });
    expect(JSON.stringify(status)).not.toContain("senha-ficticia");
  });

  it("corpo sem senha → 400; NIF de outro contribuinte → 422; emitente não-UUID → 400", async () => {
    expect((await send("PUT", `/credentials/${LE}`, { username: "599999999/37" })).status).toBe(400);
    expect((await send("PUT", `/credentials/${LE}`, { username: "500000000/1", password: "x" })).status).toBe(422);
    expect((await send("PUT", "/credentials/x", { username: "599999999/37", password: "x" })).status).toBe(400);
  });

  it("comunicar agora: envia o que falta e devolve o resumo", async () => {
    atStore.items = [
      { documentId: "11111111-1111-4111-8111-111111111111", legalEntityId: LE, documentNumber: "FS L01-2027/1", documentType: "FS", documentDate: "2027-03-10", status: "N", acceptedStatus: null, failures: 0, lastAttemptAt: null, lastOutcome: null, lastCode: null, lastMessage: null },
    ];
    gateway.responses = [efaturaResponse(0)];
    const r = await send("POST", "/communicate", {});
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ attempted: 1, accepted: 1, rejected: 0, failed: 0, withoutCredentials: 0 });
    const hist = await (await send("GET", "/documents/11111111-1111-4111-8111-111111111111")).json();
    expect(hist).toMatchObject([{ operation: "register", outcome: "accepted", code: 0 }]);
  });

  it("série inexistente → 404 sem chamar a AT", async () => {
    const before = gateway.sent.length;
    expect((await send("POST", "/series/33333333-3333-4333-8333-333333333333/register", { username: "599999999/2", password: "x" })).status).toBe(404);
    expect(gateway.sent).toHaveLength(before);
  });

  it("apagar credenciais → 204", async () => {
    expect((await send("DELETE", `/credentials/${LE}`)).status).toBe(204);
    expect((await (await send("GET", "")).json()).credentials).toEqual([]);
  });
});
