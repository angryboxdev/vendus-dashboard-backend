import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { correlationId } from "../correlation.js";
import { assertIfMatch, etagFor, setEtag } from "../etag.js";
import { idempotency, InMemoryIdempotencyStore } from "../idempotency.js";
import { problem, problemHandler } from "../problem-details.js";

// Mesmo padrão dos outros testes de router: require simples (ts-jest em CommonJS, sem esModuleInterop).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

/**
 * TK-2 (Fase 0, task RH): endpoint de exemplo com Idempotency-Key e
 * ETag/If-Match. Recurso em memória — o objetivo é provar a infraestrutura
 * HTTP partilhada, não um domínio.
 */
function sampleApp() {
  const notes = new Map<string, { id: string; text: string; version: number }>();
  let seq = 0;
  const app = express();
  app.use(express.json());
  app.use(correlationId);
  app.use(idempotency(new InMemoryIdempotencyStore(), { required: true }));

  app.post("/api/sample/notes", (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) throw problem(400, "validation_error", "O texto é obrigatório.", { field: "text" });
    seq += 1;
    const note = { id: `n${seq}`, text, version: 1 };
    notes.set(note.id, note);
    setEtag(res, etagFor(note.version));
    res.status(201).json(note);
  });
  app.get("/api/sample/notes/:id", (req, res) => {
    const note = notes.get(req.params.id);
    if (!note) throw problem(404, "not_found");
    setEtag(res, etagFor(note.version));
    res.json(note);
  });
  app.patch("/api/sample/notes/:id", (req, res) => {
    const note = notes.get(req.params.id);
    if (!note) throw problem(404, "not_found");
    assertIfMatch(req, etagFor(note.version));
    note.text = String(req.body?.text ?? note.text);
    note.version += 1;
    setEtag(res, etagFor(note.version));
    res.json(note);
  });
  app.use(problemHandler);
  return { app, count: () => notes.size };
}

describe("TK-2 — integridade das escritas (endpoint de exemplo)", () => {
  let server: Server;
  let base: string;
  let count: () => number;

  beforeEach(async () => {
    const s = sampleApp();
    count = s.count;
    server = await new Promise<Server>((resolve) => {
      const srv = s.app.listen(0, () => resolve(srv));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const post = (body: unknown, key?: string) =>
    fetch(`${base}/api/sample/notes`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key && { "Idempotency-Key": key }) },
      body: JSON.stringify(body),
    });

  test("TK_2_post_repetido_com_mesma_idempotency_key_devolve_a_mesma_resposta_sem_duplicar", async () => {
    const first = await post({ text: "olá" }, "k-123");
    const second = await post({ text: "olá" }, "k-123");
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(await first.json());
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    expect(second.headers.get("etag")).toBe(first.headers.get("etag"));
    expect(count()).toBe(1);
  });

  test("TK_2_mesma_chave_com_outro_corpo_e_recusada", async () => {
    await post({ text: "a" }, "k-1");
    const res = await post({ text: "b" }, "k-1");
    expect(res.status).toBe(422);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect((await res.json()).type).toBe("/problems/idempotency_key_reused");
    expect(count()).toBe(1);
  });

  test("TK_2_escrita_sem_idempotency_key_e_recusada_quando_obrigatoria", async () => {
    const res = await post({ text: "a" });
    expect(res.status).toBe(400);
    expect(count()).toBe(0);
  });

  test("TK_2_if_match_desatualizado_devolve_412", async () => {
    const created = await (await post({ text: "v1" }, "k-c")).json();
    const etagV1 = etagFor(1);
    const ok = await fetch(`${base}/api/sample/notes/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "If-Match": etagV1, "Idempotency-Key": "k-p1" },
      body: JSON.stringify({ text: "v2" }),
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("etag")).toBe(etagFor(2));

    const stale = await fetch(`${base}/api/sample/notes/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "If-Match": etagV1, "Idempotency-Key": "k-p2" },
      body: JSON.stringify({ text: "v3" }),
    });
    expect(stale.status).toBe(412);
    const body = await stale.json();
    expect(body).toMatchObject({ type: "/problems/precondition_failed", status: 412, instance: `/api/sample/notes/${created.id}` });
    expect(body.correlationId).toBe(stale.headers.get("x-correlation-id"));
    const current = await (await fetch(`${base}/api/sample/notes/${created.id}`)).json();
    expect(current.text).toBe("v2");
  });

  test("TK_2_escrita_sem_if_match_devolve_428", async () => {
    const created = await (await post({ text: "v1" }, "k-d")).json();
    const res = await fetch(`${base}/api/sample/notes/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "Idempotency-Key": "k-e" },
      body: JSON.stringify({ text: "x" }),
    });
    expect(res.status).toBe(428);
  });

  test("erros seguem RFC 7807 e mantêm `error` para o frontend atual", async () => {
    const res = await post({ text: "" }, "k-v");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      type: "/problems/validation_error",
      title: "Pedido inválido",
      status: 400,
      detail: "O texto é obrigatório.",
      field: "text",
      error: "O texto é obrigatório.",
    });
  });

  test("erro não tratado → 500 genérico, sem a mensagem interna", async () => {
    const app = express();
    app.use(correlationId);
    app.get("/boom", () => {
      throw new Error("segredo interno");
    });
    app.use(problemHandler);
    const srv = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/boom`);
    const text = await res.text();
    spy.mockRestore();
    await new Promise<void>((resolve) => srv.close(() => resolve()));
    expect(res.status).toBe(500);
    expect(text).not.toContain("segredo interno");
  });
});
