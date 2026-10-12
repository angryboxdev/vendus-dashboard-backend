import { Router, type Request } from "express";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import type { Actor, ChangeInput, PunchInput } from "../../application/use-cases/attendance.use-cases.js";
import type { AttendanceUseCases } from "../../application/use-cases/attendance.use-cases.js";
import type { SegmentType } from "../../domain/entities/clock.js";
import type { BreakTypeInput } from "../../domain/entities/break-type.js";
import type { CorrectionRequest, IncidentStatus } from "../../domain/entities/records.js";
import { AttendanceConflictError, AttendanceForbiddenError, AttendanceNotFoundError, AttendanceValidationError, PunchRefusedError } from "../../domain/errors.js";

const s = (v: unknown): string => (typeof v === "string" ? v : "");
const optS = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const optN = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AttendanceValidationError) throw problem(400, "validation_error", e.message, { field: e.field });
    if (e instanceof AttendanceConflictError) throw problem(409, e.code, e.message);
    if (e instanceof AttendanceForbiddenError) throw problem(403, e.code, e.message);
    if (e instanceof AttendanceNotFoundError) throw problem(404, "not_found", e.message);
    if (e instanceof PunchRefusedError) throw problem(422, e.code, e.message);
    throw e;
  }
}

const actorOf = (req: Request): Actor => ({ userId: req.auth!.sub, email: req.auth!.email || req.auth!.sub });
const org = (req: Request) => req.auth!.orgId;
const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
const id = (req: Request) => req.params.id as string;

function change(b: Record<string, unknown>): ChangeInput {
  return {
    operation: s(b.operation) as ChangeInput["operation"],
    targetEventId: optS(b.targetEventId),
    occurredAt: optS(b.occurredAt),
    segmentType: optS(b.segmentType) as SegmentType | null,
    reason: s(b.reason),
  };
}

/**
 * Portal (`/api/me/clock`): picar, o meu dia, os meus dias, recusar uma
 * correção (RE-11) e pedir correções. O colaborador é sempre o da sessão.
 * Idempotência: `clientEventId` na marcação (fila offline, RE-9) e
 * Idempotency-Key opcional nos restantes POST.
 */
export function createAttendanceMeRouter(uc: AttendanceUseCases, store: IdempotencyStore): Router {
  const r = Router();
  const M = "/me/clock";
  r.use(M, idempotency(store));

  r.get(M, async (req, res) => res.json(await run(() => uc.myStatus(org(req), actorOf(req)))));
  r.post(M, async (req, res) => {
    const b = body(req);
    const input: PunchInput = {
      segmentType: s(b.segmentType) as SegmentType,
      source: (s(b.source) || "web") as PunchInput["source"],
      clientEventId: optS(b.clientEventId),
      locationId: optS(b.locationId),
      latitude: optN(b.latitude),
      longitude: optN(b.longitude),
      ip: req.ip ?? null,
      occurredAt: optS(b.occurredAt),
      breakTypeId: optS(b.breakTypeId),
    };
    const out = await run(() => uc.punch(org(req), actorOf(req), input));
    res.status(out.duplicate ? 200 : 201).json(out);
  });
  // FE-103: pausas que se podem escolher ao marcar (só as ativas).
  r.get(`${M}/break-types`, async (req, res) => res.json((await uc.listBreakTypes(org(req))).filter((b) => !b.archived)));
  r.get(`${M}/days`, async (req, res) => res.json(await run(() => uc.myDays(org(req), actorOf(req), s(req.query.from), s(req.query.to)))));
  r.post(`${M}/revisions/:id/refuse`, async (req, res) => res.json(await run(() => uc.refuseRevision(org(req), actorOf(req), id(req), optS(body(req).comment)))));
  r.get(`${M}/corrections`, async (req, res) => res.json(await run(() => uc.myCorrections(org(req), actorOf(req)))));
  r.post(`${M}/corrections`, async (req, res) => res.status(201).json(await run(() => uc.requestCorrection(org(req), actorOf(req), change(body(req))))));
  return r;
}

/**
 * Gestão (`/api/novo-rh/attendance`, permissão `hr.attendance`): dias,
 * revisões com motivo (RE-10), pedidos de correção, incidentes, ajustes e
 * recálculo. Cada colaborador passa pelo âmbito do utilizador (RE-34).
 */
export function createAttendanceAdminRouter(
  uc: AttendanceUseCases,
  store: IdempotencyStore,
  canSeeEmployee: (req: Request, employeeId: string, date: string) => Promise<boolean>,
): Router {
  const r = Router();
  const A = "/novo-rh/attendance";
  r.use(A, idempotency(store, { required: true }));
  const today = () => new Date().toISOString().slice(0, 10);
  const scope = async (req: Request, employeeId: string, date: string) => {
    if (!employeeId || !(await canSeeEmployee(req, employeeId, date))) throw problem(404, "not_found", "Colaborador não encontrado.");
  };
  const visible = async <T extends { employeeId: string }>(req: Request, items: T[], dateOf: (t: T) => string) => {
    const out: T[] = [];
    const seen = new Map<string, boolean>();
    for (const it of items) {
      const key = `${it.employeeId}|${dateOf(it)}`;
      if (!seen.has(key)) seen.set(key, await canSeeEmployee(req, it.employeeId, dateOf(it)));
      if (seen.get(key)) out.push(it);
    }
    return out;
  };

  r.get(`${A}/days`, async (req, res) => {
    const employeeId = s(req.query.employeeId);
    await scope(req, employeeId, s(req.query.from));
    res.json(await run(() => uc.days(org(req), employeeId, s(req.query.from), s(req.query.to))));
  });
  r.get(`${A}/adjustments`, async (req, res) => {
    const employeeId = s(req.query.employeeId);
    await scope(req, employeeId, s(req.query.from));
    res.json(await run(() => uc.adjustments(org(req), employeeId, s(req.query.from), s(req.query.to))));
  });
  r.post(`${A}/revisions`, async (req, res) => {
    const b = body(req);
    const employeeId = s(b.employeeId);
    await scope(req, employeeId, s(b.occurredAt).slice(0, 10) || today());
    res.status(201).json(await run(() => uc.revise(org(req), actorOf(req), employeeId, change(b))));
  });

  // ── Catálogo de pausas (FE-103) ──
  const breakInput = (b: Record<string, unknown>): BreakTypeInput => ({
    name: s(b.name),
    color: optS(b.color),
    remuneration: s(b.remuneration) as BreakTypeInput["remuneration"],
    hybridPaidMinutes: optN(b.hybridPaidMinutes),
    maxMinutes: optN(b.maxMinutes),
    windowStart: optS(b.windowStart),
    windowEnd: optS(b.windowEnd),
    maxUsesPerDay: optN(b.maxUsesPerDay),
    weekdays: Array.isArray(b.weekdays) ? b.weekdays.map(Number) : null,
  });
  r.get(`${A}/break-types`, async (req, res) => res.json(await uc.listBreakTypes(org(req))));
  r.post(`${A}/break-types`, async (req, res) => res.status(201).json(await run(() => uc.createBreakType(org(req), actorOf(req), breakInput(body(req))))));
  r.put(`${A}/break-types/:id`, async (req, res) => {
    const b = body(req);
    res.json(await run(() => uc.updateBreakType(org(req), actorOf(req), id(req), breakInput(b), Number(b.version), s(b.reason))));
  });
  r.post(`${A}/break-types/:id/archive`, async (req, res) => {
    await run(() => uc.archiveBreakType(org(req), actorOf(req), id(req)));
    res.json({ ok: true });
  });

  r.get(`${A}/corrections`, async (req, res) => {
    const status = optS(req.query.status) as CorrectionRequest["status"] | null;
    const list = await run(() => uc.listCorrections(org(req), status ? { status } : {}));
    res.json(await visible(req, list, (c) => (c.occurredAt ?? c.createdAt).slice(0, 10)));
  });
  const decide = (decision: "approve" | "reject") => async (req: Request, res: import("express").Response) => {
    const c = await uc.getCorrection(org(req), id(req));
    if (!c) throw problem(404, "not_found", "Pedido não encontrado.");
    await scope(req, c.employeeId, (c.occurredAt ?? c.createdAt).slice(0, 10));
    res.json(await run(() => uc.decideCorrection(org(req), actorOf(req), id(req), decision, optS(body(req).comment))));
  };
  r.post(`${A}/corrections/:id/approve`, decide("approve"));
  r.post(`${A}/corrections/:id/reject`, decide("reject"));

  r.get(`${A}/incidents`, async (req, res) => {
    const status = optS(req.query.status) as IncidentStatus | null;
    const employeeId = optS(req.query.employeeId);
    if (employeeId) await scope(req, employeeId, s(req.query.from));
    const list = await run(() => uc.listIncidents(org(req), { ...(status ? { status } : {}), ...(employeeId ? { employeeId } : {}), from: s(req.query.from), to: s(req.query.to) }));
    res.json(await visible(req, list, (i) => i.workDate));
  });
  r.post(`${A}/incidents/:id/resolve`, async (req, res) => {
    const i = await uc.getIncident(org(req), id(req));
    if (!i) throw problem(404, "not_found", "Incidente não encontrado.");
    await scope(req, i.employeeId, i.workDate);
    const b = body(req);
    res.json(await run(() => uc.resolveIncident(org(req), actorOf(req), id(req), s(b.resolution) as "correct" | "validate" | "dismiss", optS(b.comment))));
  });

  r.post(`${A}/recalculate`, async (req, res) => {
    const b = body(req);
    const employeeId = s(b.employeeId);
    await scope(req, employeeId, s(b.from));
    res.status(202).json(await run(() => uc.requestRecalculation(org(req), actorOf(req), employeeId, s(b.from), s(b.to))));
  });
  return r;
}
