import { Router, type Request } from "express";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import type { Actor, PeriodsUseCases } from "../../application/use-cases/periods.use-cases.js";
import { PeriodConflictError, PeriodForbiddenError, PeriodNotFoundError, PeriodValidationError } from "../../domain/errors.js";

const s = (v: unknown): string => (typeof v === "string" ? v : "");
const optS = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof PeriodValidationError) throw problem(400, "validation_error", e.message, { field: e.field });
    if (e instanceof PeriodConflictError) throw problem(e.code === "expired" ? 410 : 409, e.code, e.message, { pending: e.pending });
    if (e instanceof PeriodForbiddenError) throw problem(403, "self_approval", e.message);
    if (e instanceof PeriodNotFoundError) throw problem(404, "not_found", e.message);
    throw e;
  }
}

const actorOf = (req: Request): Actor => ({ userId: req.auth!.sub, email: req.auth!.email || req.auth!.sub });
const org = (req: Request) => req.auth!.orgId;
const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
const id = (req: Request) => req.params.id as string;

/**
 * Períodos (`/api/novo-rh/periods`, `hr.closure`): criar, pré-verificar,
 * fechar (com exceção explícita), reabrir com dupla aprovação, exportar
 * (fila + centro de transferências + links que expiram).
 */
export function createPeriodsRouter(uc: PeriodsUseCases, store: IdempotencyStore, canSensitive: (req: Request) => boolean): Router {
  const r = Router();
  const P = "/novo-rh/periods";
  r.use(P, idempotency(store, { required: true }));

  r.get(P, async (req, res) => res.json(await uc.listPeriods(org(req))));
  r.post(P, async (req, res) => {
    const b = body(req);
    res.status(201).json(await run(() => uc.createPeriod(org(req), actorOf(req), { scopeType: s(b.scopeType) as "organization" | "location", scopeId: optS(b.scopeId), startDate: s(b.startDate), endDate: s(b.endDate) })));
  });
  r.get(`${P}/reopenings`, async (req, res) => res.json(await uc.listReopenings(org(req))));
  r.post(`${P}/reopenings/:id/approve`, async (req, res) => res.json(await run(() => uc.approveReopen(org(req), actorOf(req), id(req)))));
  r.post(`${P}/reopenings/:id/reject`, async (req, res) => res.json(await run(() => uc.rejectReopen(org(req), actorOf(req), id(req), optS(body(req).reason)))));
  r.get(`${P}/exports`, async (req, res) => res.json(await uc.listMyExports(org(req), actorOf(req))));
  r.get(`${P}/exports/:id/link`, async (req, res) => res.json(await run(() => uc.exportLink(org(req), actorOf(req), id(req)))));
  r.get(`${P}/exports/:id/download`, async (req, res) => {
    const f = await run(() => uc.download(org(req), actorOf(req), id(req), s(req.query.token)));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${f.fileName.replace(/[^\w.-]/g, "_")}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(f.content);
  });
  r.get(`${P}/:id/precheck`, async (req, res) => res.json(await run(() => uc.precheck(org(req), id(req)))));
  r.get(`${P}/:id/closures`, async (req, res) => res.json(await run(() => uc.closures(org(req), id(req)))));
  r.post(`${P}/:id/close`, async (req, res) => res.json(await run(() => uc.close(org(req), actorOf(req), id(req), optS(body(req).exceptionReason)))));
  r.post(`${P}/:id/reopen`, async (req, res) => res.status(201).json(await run(() => uc.requestReopen(org(req), actorOf(req), id(req), s(body(req).reason)))));
  r.post(`${P}/:id/exports`, async (req, res) => {
    const b = body(req);
    // Colunas sensíveis (NIF) só com a permissão `hr.sensitive_data`.
    res.status(202).json(await run(() => uc.requestExport(org(req), actorOf(req), id(req), s(b.kind) === "billing_location" ? "billing_location" : "payroll", b.includeSensitive === true && canSensitive(req))));
  });
  return r;
}
