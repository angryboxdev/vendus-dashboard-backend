import { Router, type Request, type Response } from "express";
import multer from "multer";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import type { AbsencesUseCases, Actor, RequestInput } from "../../application/use-cases/absences.use-cases.js";
import type { AbsenceTypeInput } from "../../domain/entities/absence-type.js";
import type { ApprovalFlowInput } from "../../domain/entities/approval-flow.js";
import type { RequestStatus } from "../../domain/entities/request.js";
import { AbsenceConflictError, AbsenceForbiddenError, AbsenceNotFoundError, AbsenceRuleError, AbsenceValidationError } from "../../domain/errors.js";
import { ATTACHMENT_MAX_BYTES } from "../../domain/services/attachment.service.js";

// Anexos dos pedidos em memória (o caso de uso valida tipo e tamanho; o limite aqui corta uploads abusivos).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: ATTACHMENT_MAX_BYTES + 1, files: 1 } });

const s = (v: unknown): string => (typeof v === "string" ? v : "");
const optS = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const optN = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AbsenceValidationError) throw problem(400, "validation_error", e.message, { field: e.field });
    if (e instanceof AbsenceRuleError) throw problem(422, e.code, e.message);
    if (e instanceof AbsenceConflictError) throw problem(409, e.code, e.message);
    if (e instanceof AbsenceForbiddenError) throw problem(403, e.code, e.message);
    if (e instanceof AbsenceNotFoundError) throw problem(404, "not_found", e.message);
    throw e;
  }
}

const actorOf = (req: Request): Actor => ({ userId: req.auth!.sub, email: req.auth!.email || req.auth!.sub });
const org = (req: Request) => req.auth!.orgId;
const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
const id = (req: Request) => req.params.id as string;

function typeInput(b: Record<string, unknown>): AbsenceTypeInput {
  return {
    name: s(b.name),
    code: optS(b.code),
    color: optS(b.color),
    category: s(b.category) as AbsenceTypeInput["category"],
    unit: (s(b.unit) || "days") as AbsenceTypeInput["unit"],
    counting: (s(b.counting) || "working") as AbsenceTypeInput["counting"],
    limitAmount: optN(b.limitAmount),
    renewal: (s(b.renewal) || "calendar_year") as AbsenceTypeInput["renewal"],
    allowNegative: b.allowNegative === true,
    carryOver: b.carryOver === true,
    requiresApproval: b.requiresApproval !== false,
    private: b.private === true,
    hiddenFromEmployee: b.hiddenFromEmployee === true,
    attachment: (s(b.attachment) || "none") as AbsenceTypeInput["attachment"],
    timeImpact: (s(b.timeImpact) || "reduce_theoretical") as AbsenceTypeInput["timeImpact"],
    intersectSchedule: b.intersectSchedule !== false,
    halfDay: b.halfDay === true,
    minConsecutive: optN(b.minConsecutive),
    maxConsecutive: optN(b.maxConsecutive),
    blockedDates: strArr(b.blockedDates),
    paid: b.paid !== false,
    flowId: optS(b.flowId),
  };
}

function flowInput(b: Record<string, unknown>): ApprovalFlowInput {
  const levels = Array.isArray(b.levels) ? (b.levels as Record<string, unknown>[]).map((l) => ({ people: strArr(l?.people), roles: strArr(l?.roles) })) : [];
  return { name: s(b.name), scope: (s(b.scope) || "absences") as ApprovalFlowInput["scope"], isDefault: b.isDefault === true, levels, fallbackUserIds: strArr(b.fallbackUserIds) };
}

function requestInput(b: Record<string, unknown>, employeeId: string): RequestInput {
  return {
    employeeId,
    typeId: s(b.typeId),
    startDate: s(b.startDate),
    endDate: s(b.endDate) || s(b.startDate),
    startTime: optS(b.startTime),
    endTime: optS(b.endTime),
    halfDay: b.halfDay === true,
    comment: optS(b.comment),
    attachmentDocumentId: optS(b.attachmentDocumentId),
    attachment: attachmentOf(b.attachment),
  };
}

/** Anexo devolvido por `POST /me/absence-attachments` (o caso de uso valida que é da pasta do colaborador). */
function attachmentOf(v: unknown): NonNullable<RequestInput["attachment"]> | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  return typeof a.path === "string" && a.path ? { path: a.path, name: s(a.name) || "anexo", mime: s(a.mime) || "application/octet-stream" } : null;
}

export interface AbsencesAccess {
  canSeeEmployee: (req: Request, employeeId: string, date: string) => Promise<boolean>;
  /** Permissão especial `hr.absences_private`. */
  canPrivate: (req: Request) => boolean;
}

/**
 * Gestão (`/api/novo-rh/absences`, `hr.leave`): tipos, fluxos de aprovação,
 * pedidos (atribuir, cancelar), saldos e ajustes, compensação de feriados.
 */
export function createAbsencesAdminRouter(uc: AbsencesUseCases, store: IdempotencyStore, access: AbsencesAccess): Router {
  const r = Router();
  const A = "/novo-rh/absences";
  r.use(A, idempotency(store, { required: true }));
  const today = () => new Date().toISOString().slice(0, 10);
  const scope = async (req: Request, employeeId: string, date: string) => {
    if (!employeeId || !(await access.canSeeEmployee(req, employeeId, /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today()))) throw problem(404, "not_found", "Colaborador não encontrado.");
  };

  r.get(`${A}/types`, async (req, res) => res.json(await uc.listTypes(org(req))));
  r.post(`${A}/types`, async (req, res) => res.status(201).json(await run(() => uc.createType(org(req), actorOf(req), typeInput(body(req))))));
  r.put(`${A}/types/:id`, async (req, res) => res.json(await run(() => uc.updateType(org(req), actorOf(req), id(req), typeInput(body(req))))));
  r.post(`${A}/types/:id/archive`, async (req, res) => {
    await run(() => uc.archiveType(org(req), actorOf(req), id(req)));
    res.status(204).end();
  });

  r.get(`${A}/flows`, async (req, res) => res.json(await uc.listFlows(org(req))));
  r.post(`${A}/flows`, async (req, res) => res.status(201).json(await run(() => uc.createFlow(org(req), actorOf(req), flowInput(body(req))))));
  r.put(`${A}/flows/:id`, async (req, res) => res.json(await run(() => uc.updateFlow(org(req), actorOf(req), id(req), flowInput(body(req))))));
  r.post(`${A}/flows/:id/archive`, async (req, res) => {
    await run(() => uc.archiveFlow(org(req), actorOf(req), id(req)));
    res.status(204).end();
  });

  r.get(`${A}/requests`, async (req, res) => {
    const employeeId = optS(req.query.employeeId);
    if (employeeId) await scope(req, employeeId, s(req.query.from));
    const status = optS(req.query.status) as RequestStatus | null;
    const list = await uc.listRequests(
      org(req),
      { ...(status ? { status } : {}), ...(employeeId ? { employeeId } : {}), ...(optS(req.query.from) ? { from: s(req.query.from) } : {}), ...(optS(req.query.to) ? { to: s(req.query.to) } : {}) },
      access.canPrivate(req),
      req.auth!.sub,
    );
    const out = [];
    const seen = new Map<string, boolean>();
    for (const x of list) {
      if (!seen.has(x.employeeId)) seen.set(x.employeeId, await access.canSeeEmployee(req, x.employeeId, x.startDate));
      if (seen.get(x.employeeId)) out.push(x);
    }
    res.json(out);
  });
  r.get(`${A}/requests/:id`, async (req, res) => {
    const detail = await run(() => uc.requestDetail(org(req), id(req), access.canPrivate(req), req.auth!.sub));
    await scope(req, detail.employeeId, detail.startDate);
    res.json(detail);
  });
  // Anexo (link temporário): no âmbito de quem vê; ausência privada só com permissão de privadas (RGPD — pode ser uma baixa médica).
  r.get(`${A}/requests/:id/attachment-url`, async (req, res) => {
    const detail = await run(() => uc.requestDetail(org(req), id(req), access.canPrivate(req), req.auth!.sub));
    await scope(req, detail.employeeId, detail.startDate);
    if (detail.private && !access.canPrivate(req)) throw problem(403, "forbidden", "Sem permissão para ver anexos de ausências privadas.");
    res.json(await run(() => uc.attachmentUrl(org(req), actorOf(req), id(req), "manager")));
  });
  r.post(`${A}/requests`, async (req, res) => {
    const b = body(req);
    await scope(req, s(b.employeeId), s(b.startDate));
    res.status(201).json(await run(() => uc.createRequest(org(req), actorOf(req), requestInput(b, s(b.employeeId)), "assign")));
  });
  r.post(`${A}/requests/:id/cancel`, async (req, res) => {
    const cur = await uc.getRequest(org(req), id(req));
    if (!cur) throw problem(404, "not_found", "Pedido não encontrado.");
    await scope(req, cur.employeeId, cur.startDate);
    res.json(await run(() => uc.cancel(org(req), actorOf(req), id(req), optS(body(req).reason), true)));
  });

  r.get(`${A}/balances`, async (req, res) => {
    const employeeId = s(req.query.employeeId);
    await scope(req, employeeId, s(req.query.date));
    res.json(await run(() => uc.balances(org(req), employeeId, optS(req.query.date), access.canPrivate(req))));
  });
  r.post(`${A}/balances/adjust`, async (req, res) => {
    const b = body(req);
    await scope(req, s(b.employeeId), s(b.period));
    res.status(201).json(await run(() => uc.adjust(org(req), actorOf(req), { employeeId: s(b.employeeId), typeId: s(b.typeId), period: s(b.period), amount: Number(b.amount), reason: s(b.reason) })));
  });
  r.post(`${A}/holiday-compensation`, async (req, res) => {
    const b = body(req);
    await scope(req, s(b.employeeId), s(b.from));
    res.json(await run(() => uc.holidayCompensation(org(req), actorOf(req), s(b.employeeId), s(b.from), s(b.to))));
  });
  return r;
}

/**
 * Portal (`/api/me/absences`, `/api/me/approvals`): o colaborador pede e
 * cancela as suas; qualquer pessoa vê e decide os pedidos em que é aprovadora
 * no nível atual (a autorização é ser aprovador — RE-22).
 */
export function createAbsencesMeRouter(uc: AbsencesUseCases, store: IdempotencyStore, access: Pick<AbsencesAccess, "canPrivate">): Router {
  const r = Router();
  r.use("/me/absences", idempotency(store));
  r.use("/me/approvals", idempotency(store));

  r.get("/me/absences", async (req, res) => res.json(await run(() => uc.myRequests(org(req), actorOf(req)))));
  r.get("/me/absences/types", async (req, res) => res.json(await uc.myTypes(org(req))));
  r.get("/me/absences/balances", async (req, res) => {
    const employeeId = await run(() => uc.myEmployeeId(org(req), actorOf(req)));
    const all = await run(() => uc.balances(org(req), employeeId, optS(req.query.date), true));
    const visible = new Set((await uc.myTypes(org(req))).map((t) => t.id));
    res.json(all.filter((b) => visible.has(b.typeId)));
  });
  r.post("/me/absences", async (req, res) => {
    const employeeId = await run(() => uc.myEmployeeId(org(req), actorOf(req)));
    res.status(201).json(await run(() => uc.createRequest(org(req), actorOf(req), requestInput(body(req), employeeId), "self")));
  });
  r.post("/me/absences/:id/cancel", async (req, res) => res.json(await run(() => uc.cancel(org(req), actorOf(req), id(req), optS(body(req).reason), false))));
  // Anexo do próprio (ex.: justificar falta): carregar → caminho para o pedido; ver por link temporário.
  r.post("/me/absence-attachments", upload.single("file"), async (req, res) => {
    const f = req.file;
    if (!f) throw problem(400, "validation_error", "Escolha um ficheiro.", { field: "file" });
    res.status(201).json(await run(() => uc.uploadMyAttachment(org(req), actorOf(req), { name: f.originalname, mime: f.mimetype, bytes: f.buffer })));
  });
  r.get("/me/absences/:id/attachment-url", async (req, res) => res.json(await run(() => uc.attachmentUrl(org(req), actorOf(req), id(req), "owner"))));
  r.get("/me/approvals/:id/attachment-url", async (req, res) => res.json(await run(() => uc.attachmentUrl(org(req), actorOf(req), id(req), "approver"))));

  r.get("/me/approvals", async (req, res) => res.json(await uc.myApprovals(org(req), actorOf(req), access.canPrivate(req))));
  const decide = (d: "approve" | "reject") => async (req: Request, res: Response) => res.json(await run(() => uc.decide(org(req), actorOf(req), id(req), d, optS(body(req).comment))));
  r.post("/me/approvals/:id/approve", decide("approve"));
  r.post("/me/approvals/:id/reject", decide("reject"));
  return r;
}
