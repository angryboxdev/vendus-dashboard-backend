import { Router, type Request } from "express";
import multer from "multer";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import type { Actor, DistributionsUseCases } from "../../application/use-cases/distributions.use-cases.js";
import { DistributionError, MAX_BYTES, type Audience } from "../../domain/entities/distribution.js";

const STATUS: Record<DistributionError["code"], number> = { validation: 400, not_found: 404, invalid_state: 409, confirmation_not_required: 409 };

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DistributionError) throw problem(STATUS[e.code], e.code, e.message, e.field ? { field: e.field } : undefined);
    throw e;
  }
}

// Um pouco acima do limite: o tamanho exato é validado no domínio (erro no campo).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES + 1, files: 1 } });

const actorOf = (req: Request): Actor => ({ userId: req.auth!.sub, email: req.auth!.email || req.auth!.sub });
const org = (req: Request) => req.auth!.orgId;
const id = (req: Request) => req.params.id as string;

/** Público em JSON (no multipart chega como texto). */
function audience(v: unknown): Audience | undefined {
  let a: unknown = v;
  if (typeof v === "string") {
    try {
      a = JSON.parse(v);
    } catch {
      return undefined;
    }
  }
  if (!a || typeof a !== "object") return undefined;
  const o = a as Record<string, unknown>;
  if (o.type === "all") return { type: "all" };
  if (o.type === "locations" || o.type === "departments" || o.type === "employees") return { type: o.type, ids: Array.isArray(o.ids) ? o.ids.map(String) : [] };
  return { type: String(o.type) } as Audience;
}

/**
 * Envio de documentos (FE-065): gestão em `/api/novo-rh/document-distributions`;
 * colaborador em `/api/me/document-distributions`. O envio é multipart
 * (`file`, `title`, `audience` em JSON, `requiresConfirmation`).
 */
export function createDistributionsRouter(uc: DistributionsUseCases, store: IdempotencyStore): Router {
  const r = Router();
  const D = "/novo-rh/document-distributions";
  r.use(D, idempotency(store));
  r.use("/me/document-distributions", idempotency(store));

  r.get(D, async (req, res) => res.json(await uc.list(org(req))));
  r.post(`${D}/audience-preview`, async (req, res) => res.json(await run(() => uc.previewAudience(org(req), audience((req.body ?? {}).audience)))));
  r.post(D, (req, res, next) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) return next(problem(err.code === "LIMIT_FILE_SIZE" ? 413 : 400, "validation", err.code === "LIMIT_FILE_SIZE" ? "O ficheiro tem mais de 20 MB." : "Ficheiro inválido.", { field: "file" }));
      if (err) return next(err);
      next();
    });
  });
  r.post(D, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const f = req.file;
    const file = f ? { buffer: f.buffer, name: Buffer.from(f.originalname, "latin1").toString("utf8"), mimeType: f.mimetype, size: f.size } : null;
    const out = await run(() => uc.send(org(req), actorOf(req), { title: String(b.title ?? ""), audience: audience(b.audience), requiresConfirmation: b.requiresConfirmation === "true" || b.requiresConfirmation === true, file }));
    res.status(201).json(out);
  });
  r.get(`${D}/:id/report`, async (req, res) => res.json(await run(() => uc.report(org(req), id(req)))));
  r.post(`${D}/:id/remind`, async (req, res) => res.json(await run(() => uc.remind(org(req), actorOf(req), id(req)))));
  r.post(`${D}/:id/archive`, async (req, res) => {
    await run(() => uc.archive(org(req), actorOf(req), id(req)));
    res.status(204).end();
  });
  r.get(`${D}/:id/download-url`, async (req, res) => res.json(await run(() => uc.downloadUrl(org(req), id(req)))));
  r.get(`${D}/:id/proof.csv`, async (req, res) => {
    const f = await run(() => uc.proof(org(req), id(req)));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${f.fileName}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(f.content);
  });

  r.get("/me/document-distributions", async (req, res) => res.json(await run(() => uc.mine(org(req), actorOf(req)))));
  r.get("/me/document-distributions/:id/download-url", async (req, res) => res.json(await run(() => uc.myDownloadUrl(org(req), actorOf(req), id(req)))));
  r.post("/me/document-distributions/:id/confirm", async (req, res) => res.json(await run(() => uc.confirm(org(req), actorOf(req), id(req)))));
  return r;
}
