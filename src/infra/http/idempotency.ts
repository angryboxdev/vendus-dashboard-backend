import { createHash } from "node:crypto";
import type { RequestHandler, Response } from "express";
import type {} from "../../middleware/auth-middleware.js"; // tipo de req.auth
import { problem, sendProblem } from "./problem-details.js";

/**
 * `Idempotency-Key` para escritas (ADR-0022, task RH §4.2, TK-2).
 *
 * O mesmo pedido (mesma chave, mesmo utilizador/organização, mesmo método e
 * caminho, mesmo corpo) repetido devolve a resposta guardada, com o
 * cabeçalho `Idempotent-Replayed: true`, e não volta a executar a escrita.
 *
 * - Mesma chave com outro corpo → 422 `idempotency_key_reused`.
 * - Mesma chave ainda em curso → 409 `idempotency_in_progress`.
 * - Respostas 5xx não ficam guardadas (o cliente pode repetir).
 * - `required: true` → pedido sem chave recebe 400.
 */

const KEY_PATTERN = /^[\x21-\x7E]{1,255}$/;
const REPLAYED_HEADERS = ["content-type", "etag", "location"] as const;

export interface StoredResponse {
  status: number;
  headers: Partial<Record<(typeof REPLAYED_HEADERS)[number], string>>;
  body: string;
}

export type IdempotencyBegin =
  | { state: "new" }
  | { state: "in_progress" }
  | { state: "mismatch" }
  | { state: "done"; response: StoredResponse };

/** Onde as chaves ficam. Fase 0: memória; persistente (tabela própria) quando as escritas do RH a adotarem. */
export interface IdempotencyStore {
  begin(scope: string, fingerprint: string): Promise<IdempotencyBegin>;
  complete(scope: string, response: StoredResponse): Promise<void>;
  abandon(scope: string): Promise<void>;
}

interface Entry {
  fingerprint: string;
  response: StoredResponse | null;
  expiresAt: number;
}

/** Store em memória do processo, com expiração. Serve uma instância (Render atual) e os testes. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly ttlMs = 24 * 60 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  async begin(scope: string, fingerprint: string): Promise<IdempotencyBegin> {
    this.sweep();
    const existing = this.entries.get(scope);
    if (!existing) {
      this.entries.set(scope, { fingerprint, response: null, expiresAt: this.now() + this.ttlMs });
      return { state: "new" };
    }
    if (existing.fingerprint !== fingerprint) return { state: "mismatch" };
    if (!existing.response) return { state: "in_progress" };
    return { state: "done", response: existing.response };
  }

  async complete(scope: string, response: StoredResponse): Promise<void> {
    const entry = this.entries.get(scope);
    if (entry) entry.response = response;
  }

  async abandon(scope: string): Promise<void> {
    this.entries.delete(scope);
  }

  private sweep(): void {
    const t = this.now();
    for (const [k, e] of this.entries) if (e.expiresAt <= t) this.entries.delete(k);
  }
}

function fingerprintOf(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(body ?? null))
    .digest("hex");
}

function replay(res: Response, stored: StoredResponse): void {
  for (const h of REPLAYED_HEADERS) {
    const v = stored.headers[h];
    if (v) res.setHeader(h, v);
  }
  res.setHeader("Idempotent-Replayed", "true");
  res.status(stored.status).send(stored.body);
}

export function idempotency(store: IdempotencyStore, options: { required?: boolean } = {}): RequestHandler {
  return async (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      next();
      return;
    }
    const key = req.get("Idempotency-Key");
    if (!key) {
      if (options.required) {
        sendProblem(res, problem(400, "idempotency_key_missing", "Falta o cabeçalho Idempotency-Key.").problem);
        return;
      }
      next();
      return;
    }
    if (!KEY_PATTERN.test(key)) {
      sendProblem(res, problem(400, "idempotency_key_invalid", "Idempotency-Key inválida.").problem);
      return;
    }

    const path = req.originalUrl.split("?")[0] ?? "";
    const scope = [req.auth?.orgId ?? "-", req.auth?.sub ?? "-", req.method, path, key].join("|");
    let begun: IdempotencyBegin;
    try {
      begun = await store.begin(scope, fingerprintOf(req.body));
    } catch (e) {
      next(e);
      return;
    }
    if (begun.state === "done") {
      replay(res, begun.response);
      return;
    }
    if (begun.state === "mismatch") {
      sendProblem(res, problem(422, "idempotency_key_reused", "Esta Idempotency-Key já foi usada com outro pedido.").problem);
      return;
    }
    if (begun.state === "in_progress") {
      sendProblem(res, problem(409, "idempotency_in_progress", "Um pedido com esta Idempotency-Key ainda está a ser processado.").problem);
      return;
    }

    // Captura o corpo enviado (res.json acaba sempre em res.send com uma string).
    let captured = "";
    const originalSend = res.send.bind(res);
    res.send = ((body?: unknown) => {
      if (typeof body === "string") captured = body;
      else if (Buffer.isBuffer(body)) captured = body.toString("utf8");
      else if (body !== undefined) captured = JSON.stringify(body);
      return originalSend(body as never);
    }) as Response["send"];

    res.on("finish", () => {
      if (res.statusCode >= 500) {
        void store.abandon(scope);
        return;
      }
      const headers: StoredResponse["headers"] = {};
      for (const h of REPLAYED_HEADERS) {
        const v = res.getHeader(h);
        if (typeof v === "string") headers[h] = v;
      }
      void store.complete(scope, { status: res.statusCode, headers, body: captured });
    });
    res.on("close", () => {
      if (!res.writableFinished) void store.abandon(scope);
    });
    next();
  };
}
