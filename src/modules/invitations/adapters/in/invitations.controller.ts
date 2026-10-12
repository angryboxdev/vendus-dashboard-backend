import { Router, type Request, type RequestHandler } from "express";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import type { Actor, InvitationsUseCases } from "../../application/use-cases/invitations.use-cases.js";
import { InvitationError } from "../../domain/entities/invitation.js";

const STATUS: Record<InvitationError["code"], number> = { validation: 400, not_found: 404, invalid_invitation: 400, conflict: 409, rate_limited: 429 };

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof InvitationError) throw problem(STATUS[e.code], e.code, e.message, e.field ? { field: e.field } : undefined);
    throw e;
  }
}

const actorOf = (req: Request): Actor => ({ email: req.auth!.email || req.auth!.sub });
const org = (req: Request) => req.auth!.orgId;
const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
const id = (req: Request) => req.params.id as string;
const optStr = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Limite simples por IP para as rotas públicas (memória do processo): trava
 * tentativas de adivinhar códigos. Janela fixa.
 */
export function ipRateLimit(max: number, windowMs: number, now: () => number = Date.now): RequestHandler {
  const hits = new Map<string, { count: number; until: number }>();
  return (req, _res, next) => {
    const key = req.ip ?? "desconhecido";
    const t = now();
    const cur = hits.get(key);
    if (!cur || cur.until <= t) {
      hits.set(key, { count: 1, until: t + windowMs });
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.until <= t) hits.delete(k);
      return next();
    }
    cur.count += 1;
    if (cur.count > max) return next(problem(429, "rate_limited", "Demasiadas tentativas. Tente de novo mais tarde."));
    next();
  };
}

/**
 * Convites (FE-054). Gestão em `/api/novo-rh/invitations` (`hr.employees`);
 * o pedido de adesão é público (`/api/public/join`, sem sessão), com limite
 * por IP e a mesma resposta para qualquer código inválido.
 */
export function createInvitationsRouters(uc: InvitationsUseCases, store: IdempotencyStore): { router: Router; publicRouter: Router } {
  const router = Router();
  const I = "/novo-rh/invitations";
  router.use(I, idempotency(store));
  router.get(I, async (req, res) => res.json(await uc.list(org(req))));
  router.post(I, async (req, res) => {
    const b = body(req);
    const maxUses = b.maxUses === null || b.maxUses === undefined || b.maxUses === "" ? null : Number(b.maxUses);
    res.status(201).json(await run(() => uc.create(org(req), actorOf(req), { locationId: optStr(b.locationId), departmentId: optStr(b.departmentId), expiresInDays: Number(b.expiresInDays ?? 14), maxUses })));
  });
  router.post(`${I}/:id/revoke`, async (req, res) => {
    await run(() => uc.revoke(org(req), actorOf(req), id(req)));
    res.json({ id: id(req), status: "revoked" });
  });
  router.get(`${I}/requests`, async (req, res) => res.json(await uc.requests(org(req))));
  router.post(`${I}/requests/:id/accept`, async (req, res) => res.json(await run(() => uc.prefill(org(req), id(req)))));
  router.post(`${I}/requests/:id/complete`, async (req, res) => {
    await run(() => uc.complete(org(req), actorOf(req), id(req), String(body(req).employeeId ?? "")));
    res.json({ id: id(req), status: "accepted" });
  });
  router.post(`${I}/requests/:id/reject`, async (req, res) => {
    await run(() => uc.reject(org(req), actorOf(req), id(req), String(body(req).reason ?? "")));
    res.json({ id: id(req), status: "rejected" });
  });

  const publicRouter = Router();
  const limit = ipRateLimit(20, 15 * 60_000);
  publicRouter.get("/public/join/:code", limit, async (req, res) => res.json(await run(() => uc.check(req.params.code as string))));
  publicRouter.post("/public/join/:code", limit, async (req, res) => {
    const b = body(req);
    res.status(201).json(await run(() => uc.submit(req.params.code as string, { firstName: String(b.firstName ?? ""), lastName: String(b.lastName ?? ""), email: String(b.email ?? "") })));
  });
  return { router, publicRouter };
}
