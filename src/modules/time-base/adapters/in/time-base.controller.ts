import { Router, type Request } from "express";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import type { TimeBaseUseCases } from "../../application/use-cases/time-base.use-cases.js";
import type { HolidayCalendar, HolidayDay, TimeAssignment, VacationCalendar } from "../../domain/entities/calendars.js";
import type { ScheduleKind, ScheduleVersion } from "../../domain/entities/schedule.js";
import { TimeConflictError, TimeNotFoundError, TimeValidationError } from "../../domain/errors.js";

const s = (v: unknown): string => (typeof v === "string" ? v : "");
const optS = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const optN = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TimeValidationError) throw problem(400, "validation_error", e.message, { field: e.field });
    if (e instanceof TimeConflictError) throw problem(409, e.code, e.message, e.details);
    if (e instanceof TimeNotFoundError) throw problem(404, "not_found", e.message);
    throw e;
  }
}

function version(b: Record<string, unknown>): Omit<ScheduleVersion, "id" | "scheduleId"> {
  return {
    validFrom: s(b.validFrom),
    validTo: optS(b.validTo),
    days: (b.days && typeof b.days === "object" ? b.days : {}) as ScheduleVersion["days"],
    night: b.night === true,
    halfDayMinutes: optN(b.halfDayMinutes),
  };
}

function holidayCalendar(b: Record<string, unknown>): Omit<HolidayCalendar, "id"> {
  return {
    name: s(b.name),
    country: optS(b.country)?.toUpperCase() ?? null,
    compensationCoefficient: optN(b.compensationCoefficient) ?? 1,
    approvalRequired: b.approvalRequired === true,
    accruedExpires: b.accruedExpires === true,
    halfDayCompensation: b.halfDayCompensation === true,
  };
}

function vacationCalendar(b: Record<string, unknown>): Omit<VacationCalendar, "id"> {
  return {
    name: s(b.name),
    unit: (s(b.unit) || "days") as VacationCalendar["unit"],
    counting: (s(b.counting) || "working") as VacationCalendar["counting"],
    limited: b.limited !== false,
    maxAmount: optN(b.maxAmount),
    renewal: (s(b.renewal) || "calendar_year") as VacationCalendar["renewal"],
    renewalStart: optS(b.renewalStart),
    seniorityRules: Array.isArray(b.seniorityRules) ? (b.seniorityRules as VacationCalendar["seniorityRules"]) : [],
    cumulative: b.cumulative === true,
    halfDay: b.halfDay === true,
    allowNegative: b.allowNegative === true,
    minConsecutive: optN(b.minConsecutive),
    maxConsecutive: optN(b.maxConsecutive),
    advanceMonths: optN(b.advanceMonths),
    blockedDates: Array.isArray(b.blockedDates) ? (b.blockedDates as unknown[]).map(String) : [],
  };
}

/**
 * Novo RH → Tempo (`/api/novo-rh/time`): horários (`hr.schedules`) e
 * calendários/atribuições; teórico por colaborador com âmbito (RE-34).
 */
export function createTimeBaseRouter(
  uc: TimeBaseUseCases,
  store: IdempotencyStore,
  canSeeEmployee: (req: Request, employeeId: string, date: string) => Promise<boolean>,
): Router {
  const r = Router();
  const T = "/novo-rh/time";
  r.use(T, idempotency(store, { required: true }));
  const org = (req: Request) => req.auth!.orgId;
  const actor = (req: Request) => req.auth!.email || req.auth!.sub;
  const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
  const id = (req: Request) => req.params.id as string;

  // Horários
  r.get(`${T}/schedules`, async (req, res) => res.json(await uc.listSchedules(org(req))));
  r.post(`${T}/schedules`, async (req, res) => {
    const b = body(req);
    res.status(201).json(await run(() => uc.createSchedule(org(req), actor(req), { name: s(b.name), kind: s(b.kind) as ScheduleKind, firstVersion: version((b.version ?? {}) as Record<string, unknown>) })));
  });
  r.post(`${T}/schedules/:id/versions`, async (req, res) => res.status(201).json(await run(() => uc.addVersion(org(req), actor(req), id(req), version(body(req))))));
  r.post(`${T}/schedules/:id/archive`, async (req, res) => {
    await run(() => uc.archiveSchedule(org(req), actor(req), id(req)));
    res.json({ ok: true });
  });

  // Feriados
  r.get(`${T}/holiday-calendars`, async (req, res) => res.json(await uc.listHolidayCalendars(org(req))));
  r.post(`${T}/holiday-calendars`, async (req, res) => res.status(201).json(await run(() => uc.createHolidayCalendar(org(req), actor(req), holidayCalendar(body(req))))));
  r.patch(`${T}/holiday-calendars/:id`, async (req, res) => {
    const b = body(req);
    const full = holidayCalendar(b);
    const patch = Object.fromEntries(Object.entries(full).filter(([k]) => k in b)) as Partial<Omit<HolidayCalendar, "id">>;
    res.json(await run(() => uc.updateHolidayCalendar(org(req), actor(req), id(req), patch)));
  });
  r.post(`${T}/holiday-calendars/:id/days`, async (req, res) => {
    const b = body(req);
    const input = { date: s(b.date), name: s(b.name), kind: (s(b.kind) || "custom") as HolidayDay["kind"], status: (s(b.status) || "to_confirm") as HolidayDay["status"], coefficient: optN(b.coefficient), source: optS(b.source) };
    res.status(201).json(await run(() => uc.addHoliday(org(req), actor(req), id(req), input)));
  });
  r.post(`${T}/holiday-calendars/:id/import`, async (req, res) => res.json(await run(() => uc.importNational(org(req), actor(req), id(req), Number(body(req).year)))));
  r.patch(`${T}/holidays/:id`, async (req, res) => {
    const b = body(req);
    const patch: Partial<Pick<HolidayDay, "name" | "status" | "coefficient" | "source" | "kind">> = {};
    if ("name" in b) patch.name = s(b.name);
    if ("status" in b) patch.status = s(b.status) as HolidayDay["status"];
    if ("coefficient" in b) patch.coefficient = optN(b.coefficient);
    if ("source" in b) patch.source = optS(b.source);
    if ("kind" in b) patch.kind = s(b.kind) as HolidayDay["kind"];
    res.json(await run(() => uc.updateHoliday(org(req), actor(req), id(req), patch)));
  });
  r.post(`${T}/holidays/:id/remove`, async (req, res) => {
    await run(() => uc.removeHoliday(org(req), actor(req), id(req)));
    res.json({ ok: true });
  });

  // Férias
  r.get(`${T}/vacation-calendars`, async (req, res) => res.json(await uc.listVacationCalendars(org(req))));
  r.post(`${T}/vacation-calendars`, async (req, res) => res.status(201).json(await run(() => uc.createVacationCalendar(org(req), actor(req), vacationCalendar(body(req))))));
  r.put(`${T}/vacation-calendars/:id`, async (req, res) => res.json(await run(() => uc.updateVacationCalendar(org(req), actor(req), id(req), vacationCalendar(body(req))))));

  // Eliminar com impacto (RE-35)
  // Rotas escritas uma a uma (a matriz de autorização lê os caminhos do código — TK-5).
  r.get(`${T}/holiday-calendars/:id/delete-preview`, async (req, res) => res.json(await run(() => uc.deletePreview(org(req), "holiday_calendar", id(req)))));
  r.post(`${T}/holiday-calendars/:id/delete`, async (req, res) =>
    res.json(await run(() => uc.deleteCalendar(org(req), actor(req), "holiday_calendar", id(req), s(body(req).confirmName)))),
  );
  r.get(`${T}/vacation-calendars/:id/delete-preview`, async (req, res) => res.json(await run(() => uc.deletePreview(org(req), "vacation_calendar", id(req)))));
  r.post(`${T}/vacation-calendars/:id/delete`, async (req, res) =>
    res.json(await run(() => uc.deleteCalendar(org(req), actor(req), "vacation_calendar", id(req), s(body(req).confirmName)))),
  );

  // Atribuições
  r.get(`${T}/assignments`, async (req, res) => res.json(await uc.listAssignments(org(req))));
  r.post(`${T}/assignments`, async (req, res) => {
    const b = body(req);
    const input: Omit<TimeAssignment, "id"> = {
      resourceType: s(b.resourceType) as TimeAssignment["resourceType"],
      resourceId: s(b.resourceId),
      targetType: s(b.targetType) as TimeAssignment["targetType"],
      targetId: s(b.targetId),
      validFrom: s(b.validFrom),
      validTo: optS(b.validTo),
    };
    if (input.targetType === "employee" && !(await canSeeEmployee(req, input.targetId, input.validFrom))) throw problem(404, "not_found", "Colaborador não encontrado.");
    res.status(201).json(await run(() => uc.assign(org(req), actor(req), input)));
  });
  r.post(`${T}/assignments/:id/end`, async (req, res) => res.json(await run(() => uc.endAssignment(org(req), actor(req), id(req), s(body(req).validTo)))));

  // Teórico por colaborador (TK-11)
  r.get(`${T}/theoretical`, async (req, res) => {
    const employeeId = s(req.query.employeeId);
    const from = s(req.query.from);
    if (!employeeId || !(await canSeeEmployee(req, employeeId, from))) throw problem(404, "not_found", "Colaborador não encontrado.");
    const halfDays = s(req.query.halfDays).split(",").filter(Boolean);
    res.json(await run(() => uc.theoretical(org(req), employeeId, from, s(req.query.to), halfDays)));
  });
  r.get(`${T}/assignments-for`, async (req, res) => {
    const employeeId = s(req.query.employeeId);
    const date = s(req.query.date);
    if (!employeeId || !(await canSeeEmployee(req, employeeId, date))) throw problem(404, "not_found", "Colaborador não encontrado.");
    res.json(await uc.assignmentsFor(org(req), employeeId, date));
  });

  return r;
}
