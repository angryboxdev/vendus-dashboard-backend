import { Router, type Request } from "express";
import { assertIfMatch, etagFor } from "../../../../infra/http/etag.js";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import type { Actor, LegalEntitiesUseCases } from "../../application/use-cases/legal-entities.use-cases.js";
import { LegalEntityError, type LegalEntityInput } from "../../domain/entities/legal-entity.js";

const STATUS: Record<LegalEntityError["code"], number> = { validation: 400, not_found: 404, conflict: 409, in_use: 409 };

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof LegalEntityError) throw problem(STATUS[e.code], e.code, e.message, { ...(e.field && { field: e.field }), ...e.extra });
    throw e;
  }
}

const actorOf = (req: Request): Actor => ({ email: req.auth!.email || req.auth!.sub });
const org = (req: Request) => req.auth!.orgId;
const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
const id = (req: Request) => req.params.id as string;
const withEtag = <T extends { updatedAt: string }>(x: T) => ({ ...x, etag: etagFor(x.updatedAt) });

const FIELDS: (keyof LegalEntityInput)[] = ["name", "country", "taxIdType", "taxId", "socialSecurityId", "billingEmail", "street", "postalCode", "city", "region", "phone"];

function input(b: Record<string, unknown>, partial: boolean): Partial<LegalEntityInput> {
  const out: Record<string, unknown> = {};
  for (const k of FIELDS) {
    if (!(k in b)) {
      if (!partial) out[k] = k === "phone" ? null : "";
      continue;
    }
    const v = b[k];
    out[k] = k === "phone" ? (typeof v === "string" && v.trim() ? v : null) : String(v ?? "");
  }
  return out as Partial<LegalEntityInput>;
}

/**
 * Entidades legais (FE-092) e a entidade de cada centro (FE-093):
 * `/api/novo-rh/legal-entities`. Editar pede `If-Match` e motivo; nunca há
 * DELETE (só arquivar).
 */
export function createLegalEntitiesRouter(uc: LegalEntitiesUseCases, store: IdempotencyStore): Router {
  const r = Router();
  const L = "/novo-rh/legal-entities";
  r.use(L, idempotency(store));

  r.get(`${L}/catalog`, (_req, res) => res.json(uc.catalog()));
  r.get(`${L}/locations`, async (req, res) => res.json(await uc.locations(org(req))));
  r.put(`${L}/locations/:locationId`, async (req, res) => {
    const v = body(req).legalEntityId;
    await run(() => uc.setLocationEntity(org(req), actorOf(req), req.params.locationId as string, typeof v === "string" && v ? v : null));
    res.json(await uc.locations(org(req)));
  });
  r.get(L, async (req, res) => {
    const status = req.query.status === "archived" || req.query.status === "all" ? req.query.status : "active";
    res.json((await uc.list(org(req), { q: typeof req.query.q === "string" ? req.query.q : "", status })).map(withEtag));
  });
  r.post(L, async (req, res) => res.status(201).json(withEtag(await run(() => uc.create(org(req), actorOf(req), input(body(req), false) as LegalEntityInput)))));
  r.get(`${L}/:id/usage`, async (req, res) => res.json(await run(() => uc.usage(org(req), id(req)))));
  r.patch(`${L}/:id`, async (req, res) => {
    const b = body(req);
    const updated = await run(async () => {
      const cur = (await uc.list(org(req), { status: "all" })).find((e) => e.id === id(req));
      if (!cur) throw new LegalEntityError("Entidade legal não encontrada.", "not_found");
      assertIfMatch(req, etagFor(cur.updatedAt));
      return uc.update(org(req), actorOf(req), id(req), input(b, true), String(b.reason ?? ""));
    });
    res.json(withEtag(updated));
  });
  r.post(`${L}/:id/archive`, async (req, res) => res.json(withEtag(await run(() => uc.archive(org(req), actorOf(req), id(req), String(body(req).reason ?? ""))))));
  r.post(`${L}/:id/restore`, async (req, res) => res.json(withEtag(await run(() => uc.restore(org(req), actorOf(req), id(req))))));
  return r;
}
