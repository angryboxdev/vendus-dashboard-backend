import { Router, type Request } from "express";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import type { CoverageUseCases } from "../../application/use-cases/coverage.use-cases.js";
import type { Actor, RostersUseCases, ShiftInput } from "../../application/use-cases/rosters.use-cases.js";
import type { Segment } from "../../domain/entities/roster.js";
import { RosterBlockedError, RosterConflictError, RosterForbiddenError, RosterNotFoundError, RosterValidationError } from "../../domain/errors.js";

const s = (v: unknown): string => (typeof v === "string" ? v : "");
const optS = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const segs = (v: unknown): Segment[] => (Array.isArray(v) ? (v as Record<string, unknown>[]).map((x) => ({ start: s(x?.start), end: s(x?.end) })) : []);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof RosterValidationError) throw problem(400, "validation_error", e.message, { field: e.field });
    if (e instanceof RosterBlockedError) throw problem(422, "constraints_blocked", e.message, { violations: e.violations });
    if (e instanceof RosterConflictError) throw problem(409, e.code, e.message, { violations: e.violations });
    if (e instanceof RosterForbiddenError) throw problem(403, "forbidden", e.message);
    if (e instanceof RosterNotFoundError) throw problem(404, "not_found", e.message);
    throw e;
  }
}

const actorOf = (req: Request): Actor => ({ userId: req.auth!.sub, email: req.auth!.email || req.auth!.sub });
const org = (req: Request) => req.auth!.orgId;
const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
const id = (req: Request) => req.params.id as string;

function shiftInput(b: Record<string, unknown>): ShiftInput {
  return { employeeId: s(b.employeeId), workDate: s(b.workDate), kind: s(b.kind) === "day_off" ? "day_off" : "shift", templateId: optS(b.templateId), segments: segs(b.segments), areaId: optS(b.areaId) };
}

/**
 * Escalas (`/api/novo-rh/rosters`, `hr.schedules`): modelos, escalas, turnos
 * em rascunho, publicar (versões), histórico, restrições, trocas.
 * Portal: `/api/me/roster` (os meus turnos publicados) e trocas.
 */
export function createRostersRouter(
  uc: RostersUseCases,
  store: IdempotencyStore,
  canSeeEmployee: (req: Request, employeeId: string, date: string) => Promise<boolean>,
  coverage?: CoverageUseCases,
): Router {
  const r = Router();
  const R = "/novo-rh/rosters";
  r.use(R, idempotency(store, { required: true }));
  r.use("/me/roster", idempotency(store));
  const scope = async (req: Request, employeeId: string, date: string) => {
    if (!employeeId || !(await canSeeEmployee(req, employeeId, /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10)))) throw problem(404, "not_found", "Colaborador não encontrado.");
  };
  const opts = (b: Record<string, unknown>) => ({ reason: optS(b.reason), confirm: b.confirm === true });
  // Período opcional (ex.: a semana visível): valida e publica só os pendentes desse período.
  const period = (from: unknown, to: unknown) => (optS(from) && optS(to) ? { from: optS(from)!, to: optS(to)! } : null);

  r.get(`${R}/templates`, async (req, res) => res.json(await uc.listTemplatesWithUsage(org(req))));
  r.post(`${R}/templates`, async (req, res) => {
    const b = body(req);
    res.status(201).json(await run(() => uc.createTemplate(org(req), actorOf(req), { name: s(b.name), abbreviation: s(b.abbreviation), color: optS(b.color), onCall: b.onCall === true, segments: segs(b.segments) })));
  });
  // Editar: nunca usado → no lugar; usado → nova versão (os turnos existentes ficam no antigo).
  r.put(`${R}/templates/:id`, async (req, res) => {
    const b = body(req);
    res.json(await run(() => uc.updateTemplate(org(req), actorOf(req), id(req), { name: s(b.name), abbreviation: s(b.abbreviation), color: optS(b.color), onCall: b.onCall === true, segments: segs(b.segments) })));
  });
  r.put(`${R}/templates/:id/color`, async (req, res) => res.json(await run(() => uc.setTemplateColor(org(req), actorOf(req), id(req), optS(body(req).color)))));
  r.post(`${R}/templates/:id/archive`, async (req, res) => {
    await run(() => uc.archiveTemplate(org(req), actorOf(req), id(req)));
    res.status(204).end();
  });

  // Áreas de trabalho por centro (antes das rotas `${R}/:id`).
  r.get(`${R}/areas`, async (req, res) => res.json(await uc.listAreas(org(req), optS(req.query.locationId))));
  r.post(`${R}/areas`, async (req, res) => {
    const b = body(req);
    res.status(201).json(await run(() => uc.createArea(org(req), actorOf(req), { locationId: s(b.locationId), name: s(b.name) })));
  });
  r.patch(`${R}/areas/:id`, async (req, res) => {
    const b = body(req);
    res.json(
      await run(() =>
        uc.updateArea(org(req), actorOf(req), id(req), {
          ...(b.name !== undefined && { name: s(b.name) }),
          ...(b.sortOrder !== undefined && { sortOrder: Number(b.sortOrder) }),
          ...(b.active !== undefined && { active: b.active === true }),
        }),
      ),
    );
  });

  // Plano de Cobertura (opcional por empresa; antes das rotas `${R}/:id`).
  if (coverage) {
    const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
    r.get(`${R}/coverage/status`, async (req, res) => res.json(await coverage.status(org(req))));
    r.put(`${R}/coverage/status`, async (req, res) => res.json(await run(() => coverage.setEnabled(org(req), actorOf(req), body(req).enabled === true))));
    r.get(`${R}/coverage/rules`, async (req, res) => res.json(await coverage.listRules(org(req), optS(req.query.locationId))));
    r.post(`${R}/coverage/rules`, async (req, res) => {
      const b = body(req);
      res.status(201).json(
        await run(() =>
          coverage.createRule(org(req), actorOf(req), { locationId: s(b.locationId), areaId: optS(b.areaId), weekday: num(b.weekday), date: optS(b.date), start: s(b.start), end: s(b.end), minPeople: Number(b.minPeople) }),
        ),
      );
    });
    r.patch(`${R}/coverage/rules/:id`, async (req, res) => {
      const b = body(req);
      res.json(
        await run(() =>
          coverage.updateRule(org(req), actorOf(req), id(req), {
            ...(b.start !== undefined && { start: s(b.start) }),
            ...(b.end !== undefined && { end: s(b.end) }),
            ...(b.minPeople !== undefined && { minPeople: Number(b.minPeople) }),
          }),
        ),
      );
    });
    r.delete(`${R}/coverage/rules/:id`, async (req, res) => {
      await run(() => coverage.deleteRule(org(req), actorOf(req), id(req)));
      // 200 com corpo: o cliente do frontend lê sempre JSON.
      res.json({ deleted: true });
    });
    r.get(`${R}/:id/coverage`, async (req, res) => res.json(await run(() => coverage.coverage(org(req), id(req), s(req.query.from), s(req.query.to)))));
  }

  r.get(R, async (req, res) => res.json(await uc.listRosters(org(req))));
  r.get(`${R}/summary`, async (req, res) => res.json(await run(() => uc.summary(org(req), s(req.query.from), s(req.query.to)))));
  r.post(R, async (req, res) => {
    const b = body(req);
    res.status(201).json(await run(() => uc.createRoster(org(req), actorOf(req), { name: s(b.name), targetType: s(b.targetType) as "location" | "group", targetId: s(b.targetId) })));
  });
  r.post(`${R}/:id/archive`, async (req, res) => {
    await run(() => uc.archiveRoster(org(req), actorOf(req), id(req)));
    res.status(204).end();
  });
  r.get(`${R}/:id/shifts`, async (req, res) => res.json(await run(() => uc.listShifts(org(req), id(req), s(req.query.from), s(req.query.to)))));
  r.post(`${R}/:id/shifts`, async (req, res) => {
    const input = shiftInput(body(req));
    await scope(req, input.employeeId, input.workDate);
    res.status(201).json(await run(() => uc.addShift(org(req), actorOf(req), id(req), input)));
  });
  r.post(`${R}/:id/shifts/bulk`, async (req, res) => {
    const b = body(req);
    const employeeIds = strArr(b.employeeIds);
    for (const e of employeeIds) await scope(req, e, s(b.from));
    res.status(201).json(await run(() => uc.assignBulk(org(req), actorOf(req), id(req), { employeeIds, from: s(b.from), to: s(b.to), weekdays: strArr(b.weekdays), kind: s(b.kind) === "day_off" ? "day_off" : "shift", templateId: optS(b.templateId), areaId: optS(b.areaId) })));
  });
  // Copiar a semana visível para a seguinte (rascunho); quem está fora do âmbito do gestor salta.
  r.post(`${R}/:id/copy-week`, async (req, res) => {
    const from = s(body(req).from);
    res.status(201).json(await run(() => uc.copyWeek(org(req), actorOf(req), id(req), { from }, (e) => canSeeEmployee(req, e, from))));
  });
  r.post(`${R}/:id/clear-pending`, async (req, res) => {
    const b = body(req);
    await scope(req, s(b.employeeId), s(b.from));
    res.json(await run(() => uc.clearPending(org(req), actorOf(req), id(req), { employeeId: s(b.employeeId), from: s(b.from), to: s(b.to), ...(Array.isArray(b.shiftIds) && { shiftIds: strArr(b.shiftIds) }) })));
  });
  r.post(`${R}/:id/shifts/restore`, async (req, res) => {
    const b = body(req);
    res.json(await run(() => uc.restoreShifts(org(req), actorOf(req), id(req), strArr(b.shiftIds))));
  });
  r.get(`${R}/:id/check`, async (req, res) => res.json(await run(() => uc.check(org(req), id(req), period(req.query.from, req.query.to)))));
  r.post(`${R}/:id/publish`, async (req, res) => {
    const b = body(req);
    const p = period(b.from, b.to);
    res.json(await run(() => uc.publish(org(req), actorOf(req), id(req), { ...opts(b), from: p?.from ?? null, to: p?.to ?? null })));
  });
  // Seletor «Adicionar colaboradores»: pertenças ao centro/grupo e turnos noutras escalas no período.
  r.get(`${R}/:id/candidates`, async (req, res) => res.json(await run(() => uc.candidates(org(req), id(req), s(req.query.from), s(req.query.to)))));
  r.get(`${R}/:id/history`, async (req, res) => res.json(await run(() => uc.history(org(req), id(req)))));

  r.patch(`${R}/shifts/:id`, async (req, res) => {
    const b = body(req);
    const patch: Partial<ShiftInput> = {};
    if (b.employeeId !== undefined) patch.employeeId = s(b.employeeId);
    if (b.kind !== undefined) patch.kind = s(b.kind) === "day_off" ? "day_off" : "shift";
    if (b.templateId !== undefined) patch.templateId = optS(b.templateId);
    if (b.segments !== undefined) patch.segments = segs(b.segments);
    if (b.areaId !== undefined) patch.areaId = optS(b.areaId);
    if (patch.employeeId) await scope(req, patch.employeeId, "");
    res.json(await run(() => uc.updateShift(org(req), actorOf(req), id(req), patch, opts(b))));
  });
  r.post(`${R}/shifts/:id/delete`, async (req, res) => res.json(await run(() => uc.deleteShift(org(req), actorOf(req), id(req), opts(body(req))))));

  r.get(`${R}/swaps`, async (req, res) => res.json(await uc.listSwaps(org(req), (optS(req.query.status) ?? undefined) as Parameters<RostersUseCases["listSwaps"]>[1])));
  r.post(`${R}/swaps/:id/decide`, async (req, res) => {
    const b = body(req);
    res.json(await run(() => uc.decideSwap(org(req), actorOf(req), id(req), s(b.decision) !== "reject", optS(b.comment), b.confirm === true)));
  });

  r.get("/me/roster", async (req, res) => res.json(await run(() => uc.myRoster(org(req), actorOf(req), s(req.query.from), s(req.query.to)))));
  r.get("/me/roster/swaps", async (req, res) => res.json(await run(() => uc.mySwaps(org(req), actorOf(req)))));
  r.get("/me/roster/shifts/:id/coworkers", async (req, res) => res.json(await run(() => uc.myShiftCoworkers(org(req), actorOf(req), id(req)))));
  r.post("/me/roster/swaps", async (req, res) => {
    const b = body(req);
    res.status(201).json(await run(() => uc.requestSwap(org(req), actorOf(req), { shiftId: s(b.shiftId), targetEmployeeId: s(b.targetEmployeeId), counterShiftId: optS(b.counterShiftId), comment: optS(b.comment) })));
  });
  r.post("/me/roster/swaps/:id/respond", async (req, res) => res.json(await run(() => uc.respondSwap(org(req), actorOf(req), id(req), body(req).accept === true))));
  return r;
}
