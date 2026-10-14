import { Router, raw, type Request } from "express";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { log } from "../../../../infra/http/correlation.js";
import { problem } from "../../../../infra/http/problem-details.js";
import { UNAVAILABLE, type AssistantUseCases } from "../../application/use-cases/assistant.use-cases.js";
import { AssistantError, type ChatTurn, type Viewer } from "../../domain/entities/assistant.js";

const STATUS = { validation: 400, not_found: 404, forbidden: 403, expired: 410, unavailable: 503 } as const;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AssistantError) throw problem(STATUS[e.code], `assistant_${e.code}`, e.message);
    // Falha inesperada (fornecedor, rede): a escala continua editável à mão.
    log("warn", "assistant.failed", { message: e instanceof Error ? e.message.slice(0, 200) : String(e) });
    throw problem(503, "assistant_unavailable", UNAVAILABLE);
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
function history(v: unknown): ChatTurn[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((t: unknown) => {
    const r = t as { role?: unknown; text?: unknown };
    return (r?.role === "user" || r?.role === "assistant") && typeof r.text === "string" ? [{ role: r.role, text: r.text }] : [];
  });
}

/**
 * Assistente Mezza (`/api/novo-rh/assistant`, hr.schedules READ; alterar
 * exige MANAGE, verificado no caso de uso). Escritas com Idempotency-Key:
 * retry ou duplo clique não repetem a operação.
 */
export function createAssistantRouter(uc: AssistantUseCases, store: IdempotencyStore, viewerOf: (req: Request) => Viewer, voice: boolean): Router {
  const r = Router();
  const B = "/novo-rh/assistant";
  r.use([`${B}/chat`, `${B}/confirm`, `${B}/cancel`], idempotency(store, { required: true }));

  r.get(`${B}/status`, (_req, res) => res.json({ available: uc.available, voice: uc.available && voice }));

  r.post(`${B}/chat`, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const c = (b.context ?? {}) as Record<string, unknown>;
    res.json(await run(() => uc.chat(req.auth!.orgId, viewerOf(req), { rosterId: str(c.rosterId), from: str(c.from), to: str(c.to) }, history(b.history), str(b.message))));
  });
  r.post(`${B}/confirm`, async (req, res) => res.json(await run(() => uc.confirm(req.auth!.orgId, viewerOf(req), str((req.body as Record<string, unknown>)?.token)))));
  r.post(`${B}/cancel`, async (req, res) => {
    await run(() => uc.cancel(req.auth!.orgId, viewerOf(req), str((req.body as Record<string, unknown>)?.token)));
    res.status(204).end();
  });
  // Voz: o áudio chega em bruto, é transcrito e descartado (nunca é guardado).
  r.post(`${B}/transcribe`, raw({ type: ["audio/*", "application/octet-stream"], limit: MAX_AUDIO_BYTES }), async (req, res) => {
    if (!voice) throw problem(503, "assistant_unavailable", UNAVAILABLE);
    const audio = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    res.json({ text: await run(() => uc.transcribe(audio, str(req.headers["content-type"]) || "audio/webm")) });
  });
  return r;
}
