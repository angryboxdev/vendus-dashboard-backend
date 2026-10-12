import { Router, type Request } from "express";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import { InboxValidationError, type InboxUseCases, type InboxViewer } from "../../application/use-cases/inbox.use-cases.js";
import { INBOX_TYPES, type InboxType } from "../../domain/entities/inbox.js";

/**
 * Caixa de pedidos (`/api/novo-rh/inbox`, área de gestão; cada tipo exige a
 * sua permissão — ver README): lista com contadores e decisão em lote.
 */
export function createInboxRouter(uc: InboxUseCases, store: IdempotencyStore, viewerOf: (req: Request) => InboxViewer): Router {
  const r = Router();
  const P = "/novo-rh/inbox";
  r.use(P, idempotency(store, { required: true }));
  r.get(P, async (req, res) => {
    const t = typeof req.query.type === "string" && (INBOX_TYPES as string[]).includes(req.query.type) ? (req.query.type as InboxType) : null;
    const seg = req.query.segment === "others" || req.query.segment === "all" ? req.query.segment : "mine";
    res.setHeader("Cache-Control", "no-store");
    res.json(await uc.list(req.auth!.orgId, viewerOf(req), { type: t, segment: seg }));
  });
  r.post(`${P}/decide`, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const keys = Array.isArray(b.items) ? b.items.filter((x): x is string => typeof x === "string") : [];
    try {
      res.json({ results: await uc.decide(req.auth!.orgId, viewerOf(req), keys, b.decision === "reject" ? "reject" : "approve", typeof b.comment === "string" ? b.comment : null) });
    } catch (e) {
      if (e instanceof InboxValidationError) throw problem(400, "validation_error", e.message, { field: e.field });
      throw e;
    }
  });
  return r;
}
