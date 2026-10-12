import { Router, type Request } from "express";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Actor, TimeBankUseCases } from "../../application/use-cases/time-bank.use-cases.js";
import { TimeBankConflictError, TimeBankForbiddenError, TimeBankNotFoundError, TimeBankRuleError, TimeBankValidationError } from "../../domain/errors.js";

const s = (v: unknown): string => (typeof v === "string" ? v : "");
const optS = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TimeBankValidationError) throw problem(400, "validation_error", e.message, { field: e.field });
    if (e instanceof TimeBankRuleError) throw problem(422, e.code, e.message, e.details);
    if (e instanceof TimeBankConflictError) throw problem(409, e.code, e.message);
    if (e instanceof TimeBankForbiddenError) throw problem(403, "self_action", e.message);
    if (e instanceof TimeBankNotFoundError) throw problem(404, "not_found", e.message);
    throw e;
  }
}

const actorOf = (req: Request): Actor => ({ userId: req.auth!.sub, email: req.auth!.email || req.auth!.sub });
const org = (req: Request) => req.auth!.orgId;
const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;

/**
 * Banco de horas (`/api/novo-rh/time-bank`, `hr.attendance`): ledger com
 * acumulado, sincronizar, compensar, ajustar, validação de excedente e horas
 * categorizadas. `/api/me/time-bank`: o meu histórico, se a regra deixar.
 */
export function createTimeBankRouter(
  uc: TimeBankUseCases,
  store: IdempotencyStore,
  canSeeEmployee: (req: Request, employeeId: string, date: string) => Promise<boolean>,
  directory?: (org: OrganizationId) => Promise<{ id: string; name: string; locationName: string | null }[]>,
): Router {
  const r = Router();
  const B = "/novo-rh/time-bank";
  r.use(B, idempotency(store, { required: true }));
  const today = () => new Date().toISOString().slice(0, 10);
  const scope = async (req: Request, employeeId: string) => {
    if (!employeeId || !(await canSeeEmployee(req, employeeId, today()))) throw problem(404, "not_found", "Colaborador não encontrado.");
  };
  const emp = (req: Request) => req.params.employeeId as string;

  // Lista de saldos de todos os colaboradores do âmbito (FE-034).
  if (directory) {
    r.get(`${B}/balances`, async (req, res) => {
      const people = [];
      for (const p of await directory(org(req))) if (await canSeeEmployee(req, p.id, today())) people.push(p);
      const byId = new Map((await uc.balances(org(req), people.map((p) => p.id))).map((b) => [b.employeeId, b]));
      res.json(people.map((p) => ({ ...byId.get(p.id)!, name: p.name, locationName: p.locationName })));
    });
  }
  r.get(`${B}/employees/:employeeId`, async (req, res) => {
    await scope(req, emp(req));
    res.json(await run(() => uc.ledger(org(req), emp(req), actorOf(req).email)));
  });
  r.post(`${B}/employees/:employeeId/sync`, async (req, res) => {
    await scope(req, emp(req));
    const b = body(req);
    const range = optS(b.from) && optS(b.to) ? { from: s(b.from), to: s(b.to) } : undefined;
    res.json(await run(() => uc.sync(org(req), emp(req), actorOf(req).email, range)));
  });
  r.post(`${B}/employees/:employeeId/compensate`, async (req, res) => {
    await scope(req, emp(req));
    const b = body(req);
    res.status(201).json(await run(() => uc.compensate(org(req), actorOf(req), emp(req), { mode: s(b.mode) as "rest" | "paid", seconds: Number(b.seconds), paymentMonth: optS(b.paymentMonth), reason: s(b.reason) })));
  });
  r.post(`${B}/employees/:employeeId/adjust`, async (req, res) => {
    await scope(req, emp(req));
    const b = body(req);
    res.status(201).json(await run(() => uc.adjust(org(req), actorOf(req), emp(req), { seconds: Number(b.seconds), workDate: optS(b.workDate), reason: s(b.reason) })));
  });
  r.get(`${B}/employees/:employeeId/validations`, async (req, res) => {
    await scope(req, emp(req));
    res.json(await run(() => uc.pendingValidations(org(req), emp(req))));
  });
  r.post(`${B}/employees/:employeeId/validations`, async (req, res) => {
    await scope(req, emp(req));
    const b = body(req);
    res.json(await run(() => uc.decideValidation(org(req), actorOf(req), emp(req), s(b.workDate), s(b.decision) === "reject" ? "reject" : "approve", optS(b.comment))));
  });
  r.get(`${B}/employees/:employeeId/categorized`, async (req, res) => {
    await scope(req, emp(req));
    res.json(await run(() => uc.categorized(org(req), emp(req), s(req.query.from), s(req.query.to))));
  });

  r.get(`${B}/categories`, async (req, res) => res.json(await uc.listCategories(org(req))));
  r.post(`${B}/categories`, async (req, res) => {
    const b = body(req);
    const windows = Array.isArray(b.windows) ? (b.windows as Record<string, unknown>[]).map((w) => ({ weekdays: Array.isArray(w?.weekdays) ? (w.weekdays as unknown[]).map(String) : [], start: s(w?.start), end: s(w?.end) })) : [];
    res.status(201).json(await run(() => uc.createCategory(org(req), actorOf(req), { name: s(b.name), validFrom: s(b.validFrom), validTo: optS(b.validTo), windows, factor: b.factor === null || b.factor === undefined || b.factor === "" ? null : Number(b.factor) })));
  });
  r.post(`${B}/categories/:id/archive`, async (req, res) => {
    await run(() => uc.archiveCategory(org(req), actorOf(req), req.params.id as string));
    res.status(204).end();
  });

  r.get("/me/time-bank", async (req, res) => res.json(await run(() => uc.myLedger(org(req), actorOf(req)))));
  return r;
}
