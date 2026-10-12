import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

/**
 * ID de correlação por pedido + logs estruturados sem dados pessoais
 * (ADR-0022, task RH §4.2/§4.3).
 *
 * - Aceita `X-Correlation-Id` do cliente só se for um token curto e seguro;
 *   senão gera um UUID. Devolve-o sempre no cabeçalho da resposta.
 * - `log()` escreve uma linha JSON e apaga os campos de dados pessoais
 *   (nome, NIF/NISS, IBAN, e-mail, telefone, morada, saúde, localização),
 *   mesmo que alguém os passe por engano.
 */

const HEADER = "x-correlation-id";
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

export interface RequestContext {
  correlationId: string;
  /** IP do cliente (req.ip — respeita `trust proxy` quando configurado). */
  ip: string | null;
  /** Dispositivo/navegador (User-Agent), truncado. */
  userAgent: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function currentCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

/** Contexto do pedido em curso (auditoria: IP e dispositivo). Fora de um pedido → undefined. */
export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export const correlationId: RequestHandler = (req, res, next) => {
  const incoming = req.get(HEADER);
  const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader("X-Correlation-Id", id);
  const ua = req.get("user-agent");
  storage.run({ correlationId: id, ip: req.ip ?? null, userAgent: ua ? ua.slice(0, 400) : null }, () => next());
};

/** Chaves cujo valor nunca vai para o log (comparação sem maiúsculas, `_` e `-`). */
const PII_KEYS = new Set(
  [
    "name",
    "fullname",
    "firstname",
    "lastname",
    "surname",
    "employeename",
    "nif",
    "niss",
    "nie",
    "dni",
    "taxid",
    "iban",
    "email",
    "phone",
    "mobile",
    "address",
    "morada",
    "birthdate",
    "dateofbirth",
    "health",
    "medical",
    "diagnosis",
    "latitude",
    "longitude",
    "lat",
    "lng",
    "location",
    "geo",
    "photo",
    "password",
    "pin",
    "token",
    "authorization",
  ].map((k) => k.toLowerCase()),
);

const normalizeKey = (k: string) => k.toLowerCase().replace(/[_-]/g, "");

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = PII_KEYS.has(normalizeKey(k)) ? "[redigido]" : redact(v, depth + 1);
  }
  return out;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Uma linha JSON por evento. `event` é um código estável (snake_case), nunca texto livre com dados. */
export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    correlationId: currentCorrelationId(),
    ...(redact(fields) as Record<string, unknown>),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
