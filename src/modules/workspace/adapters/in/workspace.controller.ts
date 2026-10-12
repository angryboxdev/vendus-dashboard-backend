import { Router, type Request } from "express";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import type { Actor, WorkspaceUseCases } from "../../application/use-cases/workspace.use-cases.js";
import { WorkspaceError, type FormField } from "../../domain/entities/workspace.js";

const STATUS: Record<WorkspaceError["code"], number> = { validation: 400, not_found: 404, invalid_state: 409, forbidden: 403 };

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof WorkspaceError) throw problem(STATUS[e.code], e.code, e.message, e.field ? { field: e.field } : undefined);
    throw e;
  }
}

const actorOf = (req: Request): Actor => ({ userId: req.auth!.sub, email: req.auth!.email || req.auth!.sub });
const org = (req: Request) => req.auth!.orgId;
const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
const p = (req: Request, k: string) => req.params[k] as string;
const optS = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Espaço de trabalho: gestão em `/api/novo-rh/workspace` (`hr.employees`);
 * colaborador em `/api/me/ops-tasks`, `/api/me/custom-requests`, `/api/me/whos-in`.
 */
export function createWorkspaceRouter(uc: WorkspaceUseCases, store: IdempotencyStore): Router {
  const r = Router();
  const W = "/novo-rh/workspace";
  r.use(W, idempotency(store, { required: true }));
  r.use("/me/ops-tasks", idempotency(store));
  r.use("/me/custom-requests", idempotency(store));

  // Tarefas (gestão)
  r.get(`${W}/tasks`, async (req, res) => res.json(await uc.listTasks(org(req), (optS(req.query.status) ?? undefined) as "open" | undefined)));
  r.post(`${W}/tasks`, async (req, res) => {
    const b = body(req);
    const checklist = Array.isArray(b.checklist) ? (b.checklist as Record<string, unknown>[]).map((i) => ({ text: String(i?.text ?? ""), required: i?.required === true })) : [];
    res.status(201).json(await run(() => uc.createTask(org(req), actorOf(req), { title: String(b.title ?? ""), description: optS(b.description), assigneeEmployeeId: optS(b.assigneeEmployeeId), locationId: optS(b.locationId), dueAt: optS(b.dueAt), checklist })));
  });
  r.post(`${W}/tasks/:id/items/:itemId`, async (req, res) => res.json(await run(() => uc.toggleItem(org(req), actorOf(req), p(req, "id"), p(req, "itemId"), body(req).done === true, true))));
  r.post(`${W}/tasks/:id/complete`, async (req, res) => res.json(await run(() => uc.completeTask(org(req), actorOf(req), p(req, "id"), true))));
  r.post(`${W}/tasks/:id/cancel`, async (req, res) => res.json(await run(() => uc.cancelTask(org(req), actorOf(req), p(req, "id"), String(body(req).reason ?? "")))));

  // Solicitações personalizadas (gestão)
  r.get(`${W}/forms`, async (req, res) => res.json(await uc.listForms(org(req))));
  r.post(`${W}/forms`, async (req, res) => {
    const b = body(req);
    const fields = Array.isArray(b.fields)
      ? (b.fields as Record<string, unknown>[]).map((f) => ({ id: String(f?.id ?? ""), title: String(f?.title ?? ""), type: String(f?.type ?? "") as FormField["type"], options: Array.isArray(f?.options) ? (f.options as unknown[]).map(String) : [], required: f?.required === true }))
      : [];
    res.status(201).json(await run(() => uc.createForm(org(req), actorOf(req), { title: String(b.title ?? ""), responseDays: b.responseDays === null || b.responseDays === undefined || b.responseDays === "" ? null : Number(b.responseDays), fields })));
  });
  r.post(`${W}/forms/:id/archive`, async (req, res) => {
    await run(() => uc.archiveForm(org(req), actorOf(req), p(req, "id")));
    res.status(204).end();
  });
  r.get(`${W}/requests`, async (req, res) => res.json(await uc.listRequests(org(req), (optS(req.query.status) ?? undefined) as "pending" | undefined)));
  r.post(`${W}/requests/:id/decide`, async (req, res) => {
    const b = body(req);
    res.json(await run(() => uc.decide(org(req), actorOf(req), p(req, "id"), b.decision === "reject" ? "reject" : "approve", optS(b.comment))));
  });

  // Colaborador
  r.get("/me/ops-tasks", async (req, res) => res.json(await run(() => uc.myTasks(org(req), actorOf(req)))));
  r.post("/me/ops-tasks/:id/items/:itemId", async (req, res) => res.json(await run(() => uc.toggleItem(org(req), actorOf(req), p(req, "id"), p(req, "itemId"), body(req).done === true, false))));
  r.post("/me/ops-tasks/:id/complete", async (req, res) => res.json(await run(() => uc.completeTask(org(req), actorOf(req), p(req, "id"), false))));
  r.get("/me/custom-requests/forms", async (req, res) => res.json((await uc.listForms(org(req))).filter((f) => !f.archived)));
  r.get("/me/custom-requests", async (req, res) => res.json(await run(() => uc.myRequests(org(req), actorOf(req)))));
  r.post("/me/custom-requests", async (req, res) => {
    const b = body(req);
    res.status(201).json(await run(() => uc.submit(org(req), actorOf(req), String(b.formId ?? ""), (b.answers && typeof b.answers === "object" ? b.answers : {}) as Record<string, unknown>)));
  });
  r.get("/me/whos-in", async (req, res) => res.json(await run(() => uc.whosIn(org(req), actorOf(req)))));
  return r;
}
