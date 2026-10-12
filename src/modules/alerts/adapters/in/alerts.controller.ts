import { Router, type Request } from "express";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import type { Actor, AlertsUseCases } from "../../application/use-cases/alerts.use-cases.js";
import { AlertError, type AlertRuleInput } from "../../domain/entities/alert.js";

const STATUS: Record<AlertError["code"], number> = { validation: 400, not_found: 404, invalid_state: 409 };

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AlertError) throw problem(STATUS[e.code], e.code, e.message, e.field ? { field: e.field } : undefined);
    throw e;
  }
}

const actorOf = (req: Request): Actor => ({ userId: req.auth!.sub, email: req.auth!.email || req.auth!.sub });
const org = (req: Request) => req.auth!.orgId;
const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
const id = (req: Request) => req.params.id as string;

function ruleInput(b: Record<string, unknown>): AlertRuleInput {
  return {
    kind: String(b.kind ?? "") as AlertRuleInput["kind"],
    thresholdDays: Number(b.thresholdDays),
    owner: String(b.owner ?? ""),
    slaHours: Number(b.slaHours),
    escalateTo: typeof b.escalateTo === "string" && b.escalateTo.trim() ? b.escalateTo.trim() : null,
    enabled: b.enabled !== false,
  };
}

/** Alertas (`/api/novo-rh/alerts`, `hr.overview`): regras, lista, avaliar, tratar e fechar. */
export function createAlertsRouter(uc: AlertsUseCases, store: IdempotencyStore): Router {
  const r = Router();
  const A = "/novo-rh/alerts";
  r.use(A, idempotency(store, { required: true }));
  r.get(`${A}/rules`, async (req, res) => res.json(await uc.listRules(org(req))));
  r.post(`${A}/rules`, async (req, res) => res.status(201).json(await run(() => uc.createRule(org(req), actorOf(req), ruleInput(body(req))))));
  r.put(`${A}/rules/:id`, async (req, res) => res.json(await run(() => uc.updateRule(org(req), actorOf(req), id(req), ruleInput(body(req))))));
  r.get(A, async (req, res) => {
    const s = String(req.query.status ?? "");
    res.json(await uc.list(org(req), ["open", "in_progress", "closed", "active"].includes(s) ? (s as "open") : undefined));
  });
  r.post(`${A}/run`, async (req, res) => res.json(await uc.evaluate(org(req))));
  r.post(`${A}/:id/take`, async (req, res) => res.json(await run(() => uc.take(org(req), actorOf(req), id(req)))));
  r.post(`${A}/:id/close`, async (req, res) => res.json(await run(() => uc.close(org(req), actorOf(req), id(req), String(body(req).note ?? "")))));
  return r;
}
