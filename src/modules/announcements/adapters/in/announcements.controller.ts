import { Router, type Request } from "express";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import type { Actor, AnnouncementsUseCases } from "../../application/use-cases/announcements.use-cases.js";
import { AnnouncementError, type Audience } from "../../domain/entities/announcement.js";

const STATUS: Record<AnnouncementError["code"], number> = { validation: 400, not_found: 404, audience_frozen: 409, invalid_state: 409, confirmation_not_required: 409 };

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AnnouncementError) throw problem(STATUS[e.code], e.code, e.message, e.field ? { field: e.field } : undefined);
    throw e;
  }
}

const actorOf = (req: Request): Actor => ({ userId: req.auth!.sub, email: req.auth!.email || req.auth!.sub });
const org = (req: Request) => req.auth!.orgId;
const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
const id = (req: Request) => req.params.id as string;

function audience(v: unknown): Audience | undefined {
  if (!v || typeof v !== "object") return undefined;
  const a = v as Record<string, unknown>;
  if (a.type === "all") return { type: "all" };
  if (a.type === "locations" || a.type === "departments" || a.type === "groups" || a.type === "employees") return { type: a.type, ids: Array.isArray(a.ids) ? a.ids.map(String) : [] };
  return { type: String(a.type) } as Audience;
}

/** Comunicados: gestão em `/api/novo-rh/announcements`; colaborador em `/api/me/announcements`. */
export function createAnnouncementsRouter(uc: AnnouncementsUseCases, store: IdempotencyStore): Router {
  const r = Router();
  const A = "/novo-rh/announcements";
  r.use(A, idempotency(store, { required: true }));
  r.use("/me/announcements", idempotency(store));

  r.get(A, async (req, res) => res.json(await uc.listWithStats(org(req))));
  // Quantas pessoas o público abrange (antes de publicar).
  r.post(`${A}/audience-preview`, async (req, res) => res.json(await run(() => uc.previewAudience(org(req), audience(body(req).audience) as Audience))));
  r.post(A, async (req, res) => {
    const b = body(req);
    res.status(201).json(await run(() => uc.create(org(req), actorOf(req), { title: String(b.title ?? ""), body: String(b.body ?? ""), audience: audience(b.audience) as Audience, requiresConfirmation: b.requiresConfirmation === true })));
  });
  r.patch(`${A}/:id`, async (req, res) => {
    const b = body(req);
    const patch: { title?: string; body?: string; audience?: Audience; requiresConfirmation?: boolean } = {};
    if (b.title !== undefined) patch.title = String(b.title);
    if (b.body !== undefined) patch.body = String(b.body);
    if (b.audience !== undefined) patch.audience = audience(b.audience) as Audience;
    if (b.requiresConfirmation !== undefined) patch.requiresConfirmation = b.requiresConfirmation === true;
    res.json(await run(() => uc.update(org(req), actorOf(req), id(req), patch)));
  });
  r.post(`${A}/:id/publish`, async (req, res) => res.json(await run(() => uc.publish(org(req), actorOf(req), id(req)))));
  r.post(`${A}/:id/archive`, async (req, res) => res.json(await run(() => uc.archive(org(req), actorOf(req), id(req)))));
  r.get(`${A}/:id/report`, async (req, res) => res.json(await run(() => uc.report(org(req), id(req)))));
  r.post(`${A}/:id/duplicate`, async (req, res) => res.status(201).json(await run(() => uc.duplicate(org(req), actorOf(req), id(req)))));
  r.delete(`${A}/:id`, async (req, res) => {
    await run(() => uc.deleteDraft(org(req), actorOf(req), id(req)));
    res.status(204).end();
  });
  r.post(`${A}/:id/remind`, async (req, res) => res.json(await run(() => uc.remind(org(req), actorOf(req), id(req)))));
  r.get(`${A}/:id/proof.csv`, async (req, res) => {
    const f = await run(() => uc.proof(org(req), id(req)));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${f.fileName}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(f.content);
  });

  r.get("/me/announcements", async (req, res) => res.json(await run(() => uc.mine(org(req), actorOf(req)))));
  r.post("/me/announcements/:id/read", async (req, res) => res.json(await run(() => uc.markRead(org(req), actorOf(req), id(req)))));
  r.post("/me/announcements/:id/confirm", async (req, res) => res.json(await run(() => uc.confirm(org(req), actorOf(req), id(req)))));
  return r;
}
