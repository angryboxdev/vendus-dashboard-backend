import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { InMemoryIdempotencyStore } from "../../../infra/http/idempotency.js";
import { problemHandler } from "../../../infra/http/problem-details.js";
import { mintOrganizationId } from "../../../kernel/organization-id.js";
import { createDistributionsRouter } from "../adapters/in/distributions.controller.js";
import { DistributionsUseCases } from "../application/use-cases/distributions.use-cases.js";
import { FakeCtx, FakeFiles, FakeRepo } from "./fakes.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

// O Jest corre em CommonJS sem interop: expõe o multer real como `default`.
jest.mock("multer", () => ({ __esModule: true, default: jest.requireActual("multer") }));

describe("API /api/novo-rh/document-distributions", () => {
  let server: Server;
  let base: string;
  const repo = new FakeRepo();
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = { sub: "u-rh", email: "rh@demo.invalid", orgId: mintOrganizationId("org-a"), orgRole: "admin" };
      next();
    });
    app.use("/api", createDistributionsRouter(new DistributionsUseCases(repo, new FakeFiles(), new FakeCtx()), new InMemoryIdempotencyStore()));
    app.use(problemHandler);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/novo-rh/document-distributions`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const form = (fields: Record<string, string>, file?: { body: string; type: string; name: string }) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    if (file) f.append("file", new Blob([file.body], { type: file.type }), file.name);
    return f;
  };

  test("envio multipart: cria com os destinatários e o nome do ficheiro com acentos", async () => {
    const res = await fetch(base, { method: "POST", body: form({ title: "Normas", audience: JSON.stringify({ type: "locations", ids: ["porto"] }), requiresConfirmation: "true" }, { body: "%PDF-1.4", type: "application/pdf", name: "segurança.pdf" }) });
    expect(res.status).toBe(201);
    const d = await res.json();
    expect(d).toMatchObject({ title: "Normas", fileName: "segurança.pdf", requiresConfirmation: true, stats: { recipients: 2 } });
    const list = await (await fetch(base)).json();
    expect(list[0].stats).toEqual({ recipients: 2, read: 0, confirmed: 0 });
    // O caminho no armazenamento nunca sai na API.
    expect(JSON.stringify(list)).not.toContain("storagePath");
  });

  test("erros no campo: sem ficheiro e tipo não permitido dão 400 com field=file", async () => {
    const none = await fetch(base, { method: "POST", body: form({ title: "X", audience: JSON.stringify({ type: "all" }) }) });
    expect(none.status).toBe(400);
    expect((await none.json()).field).toBe("file");
    const zip = await fetch(base, { method: "POST", body: form({ title: "X", audience: JSON.stringify({ type: "all" }) }, { body: "PK", type: "application/zip", name: "a.zip" }) });
    expect(zip.status).toBe(400);
  });

  test("pré-visualização do público em JSON", async () => {
    const res = await fetch(`${base}/audience-preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ audience: { type: "all" } }) });
    expect(await res.json()).toEqual({ recipients: 3, withoutAccount: 1 });
  });
});
