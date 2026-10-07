import { Router } from "express";
import { requireMinRole } from "../../../../middleware/auth.js";
import {
  EmployeeNotFoundError,
  InvalidWorkShiftError,
  InvalidClearShiftsScopeError,
  InvalidBaseScheduleTemplateError,
  InvalidShiftRotationError,
  InvalidRecurrenceSpecError,
  WorkShiftNotFoundError,
  WorkShiftNotInSeriesError,
  WorkShiftHasAttendanceError,
  ShiftOverlapError,
  ShiftRotationNotFoundError,
  UndoNotAvailableError,
} from "../../domain/errors.js";
import type {
  ListWorkShiftsPort,
  CreateWorkShiftPort,
  UpdateWorkShiftPort,
  DuplicateWorkShiftPort,
  DeleteWorkShiftPort,
  UndoDeleteWorkShiftsPort,
  PublishWorkShiftsPort,
  GetBaseSchedulePort,
  UpsertBaseScheduleCellPort,
  ApplyBaseSchedulePort,
  ListShiftRotationsPort,
  CreateShiftRotationPort,
  PreviewShiftRotationPort,
  ApplyShiftRotationPort,
  SetShiftRotationActivePort,
  DeleteShiftRotationPort,
  GetScheduleAlertsPort,
  PreviewWorkShiftSeriesPort,
  CreateWorkShiftSeriesPort,
  UpdateWorkShiftSeriesScopePort,
  ClearWorkShiftsPort,
  PreviewClearWorkShiftsPort,
  SeriesEditScope,
  ClearShiftsScope,
  PreviewRepeatCalendarWeekPort,
  RepeatCalendarWeekPort,
} from "../../domain/ports/in/schedule.ports.js";

const SERIES_EDIT_SCOPES = new Set(["only_this", "this_and_following", "whole_series"]);


function errorResponse(e: unknown): { status: number; body: { error: string } } {
  if (
    e instanceof InvalidWorkShiftError ||
    e instanceof InvalidBaseScheduleTemplateError ||
    e instanceof InvalidShiftRotationError ||
    e instanceof ShiftOverlapError ||
    e instanceof InvalidClearShiftsScopeError
  ) {
    return { status: 400, body: { error: e.message } };
  }
  if (e instanceof InvalidRecurrenceSpecError) {
    return { status: 400, body: { error: e.message } };
  }
  if (e instanceof EmployeeNotFoundError || e instanceof WorkShiftNotFoundError || e instanceof ShiftRotationNotFoundError) {
    return { status: 404, body: { error: e.message } };
  }
  if (e instanceof UndoNotAvailableError) {
    return { status: 410, body: { error: e.message } };
  }
  if (e instanceof WorkShiftHasAttendanceError || e instanceof WorkShiftNotInSeriesError) {
    return { status: 409, body: { error: e.message } };
  }
  return { status: 500, body: { error: e instanceof Error ? e.message : "Internal error" } };
}

/** Valida o âmbito de "Limpar turnos" vindo do body (os âmbitos antigos passam como antes; "range" é lido campo a campo). */
function readClearScope(raw: unknown): ClearShiftsScope {
  if (!raw || typeof raw !== "object" || typeof (raw as { kind?: unknown }).kind !== "string") {
    throw new InvalidClearShiftsScopeError("Âmbito em falta");
  }
  const s = raw as Record<string, unknown>;
  if (s.kind !== "range") return s as unknown as ClearShiftsScope;
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : undefined);
  const employeeIds = s.employeeIds === undefined ? undefined : Array.isArray(s.employeeIds) ? s.employeeIds.filter((id): id is string => typeof id === "string") : [];
  const locationId = str(s.locationId);
  const automationId = str(s.automationId);
  const templateId = str(s.templateId);
  return {
    kind: "range",
    from: s.from as string,
    to: s.to as string,
    ...(employeeIds && { employeeIds }),
    ...(locationId && { locationId }),
    ...(s.onlyDrafts === true && { onlyDrafts: true }),
    ...(automationId && { automationId }),
    ...(templateId && { templateId }),
  };
}

export class HrSchedulesController {
  readonly router: Router;

  constructor(
    private readonly listWorkShifts: ListWorkShiftsPort,
    private readonly createWorkShift: CreateWorkShiftPort,
    private readonly updateWorkShift: UpdateWorkShiftPort,
    private readonly duplicateWorkShift: DuplicateWorkShiftPort,
    private readonly deleteWorkShift: DeleteWorkShiftPort,
    private readonly publishWorkShifts: PublishWorkShiftsPort,
    private readonly getBaseSchedule: GetBaseSchedulePort,
    private readonly upsertBaseScheduleCell: UpsertBaseScheduleCellPort,
    private readonly applyBaseSchedule: ApplyBaseSchedulePort,
    private readonly listShiftRotations: ListShiftRotationsPort,
    private readonly createShiftRotation: CreateShiftRotationPort,
    private readonly previewShiftRotation: PreviewShiftRotationPort,
    private readonly applyShiftRotation: ApplyShiftRotationPort,
    private readonly setShiftRotationActive: SetShiftRotationActivePort,
    private readonly getScheduleAlerts: GetScheduleAlertsPort,
    private readonly previewWorkShiftSeries: PreviewWorkShiftSeriesPort,
    private readonly createWorkShiftSeries: CreateWorkShiftSeriesPort,
    private readonly updateWorkShiftSeriesScope: UpdateWorkShiftSeriesScopePort,
    private readonly clearWorkShifts: ClearWorkShiftsPort,
    private readonly previewRepeatCalendarWeek: PreviewRepeatCalendarWeekPort,
    private readonly repeatCalendarWeek: RepeatCalendarWeekPort,
    private readonly deleteShiftRotation: DeleteShiftRotationPort,
    private readonly previewClearWorkShifts: PreviewClearWorkShiftsPort,
    private readonly undoDeleteWorkShifts: UndoDeleteWorkShiftsPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    // ── Turnos ────────────────────────────────────────────────────────────

    this.router.get("/hr/schedules/work-shifts", async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        if (!q.from || !q.to) {
          res.status(400).json({ error: "from e to são obrigatórios" });
          return;
        }
        const result = await this.listWorkShifts.execute({
          organizationId: req.auth!.orgId,
          from: q.from,
          to: q.to,
          ...(q.employeeId && { employeeId: q.employeeId }),
          ...(q.locationId && { locationId: q.locationId }),
          ...(q.status === "draft" || q.status === "published" ? { status: q.status } : {}),
        });
        res.json(result);
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    this.router.post("/hr/schedules/work-shifts", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await this.createWorkShift.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          employeeId: body.employeeId as string,
          workDate: body.workDate as string,
          startTime: body.startTime as string,
          endTime: body.endTime as string,
          locationId: body.locationId as string,
          ...(body.breakMinutes != null && { breakMinutes: Number(body.breakMinutes) }),
          ...("notes" in body && { notes: (body.notes as string | null) ?? null }),
          ...(body.repeatWeeks != null && { repeatWeeks: Number(body.repeatWeeks) }),
          ...(typeof body.publish === "boolean" && { publish: body.publish }),
        });
        res.status(201).json(result);
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    this.router.patch("/hr/schedules/work-shifts/:id", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await this.updateWorkShift.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          id: req.params["id"] as string,
          ...(typeof body.workDate === "string" && { workDate: body.workDate }),
          ...(typeof body.startTime === "string" && { startTime: body.startTime }),
          ...(typeof body.endTime === "string" && { endTime: body.endTime }),
          // Sem estes três, desmarcar "termina no dia seguinte" ou mudar o 2º período não era gravado.
          ...(typeof body.endsNextDay === "boolean" && { endsNextDay: body.endsNextDay }),
          ...("secondStartTime" in body && { secondStartTime: typeof body.secondStartTime === "string" ? body.secondStartTime : null }),
          ...("secondEndTime" in body && { secondEndTime: typeof body.secondEndTime === "string" ? body.secondEndTime : null }),
          ...(typeof body.locationId === "string" && { locationId: body.locationId }),
          ...(body.breakMinutes != null && { breakMinutes: Number(body.breakMinutes) }),
          ...("notes" in body && { notes: (body.notes as string | null) ?? null }),
        });
        res.json(result);
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    this.router.post("/hr/schedules/work-shifts/:id/duplicate", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await this.duplicateWorkShift.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          id: req.params["id"] as string,
          targetDate: body.targetDate as string,
        });
        res.status(201).json(result);
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    this.router.delete("/hr/schedules/work-shifts/:id", requireMinRole("manager"), async (req, res) => {
      try {
        res.json(
          await this.deleteWorkShift.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            id: req.params["id"] as string,
          }),
        );
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    this.router.post("/hr/schedules/work-shifts/publish", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await this.publishWorkShifts.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          ids: (body.ids as string[]) ?? [],
        });
        res.json(result);
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    // ── Escala base ───────────────────────────────────────────────────────

    this.router.get("/hr/schedules/base-schedule/:employeeId", async (req, res) => {
      try {
        const result = await this.getBaseSchedule.execute({
          organizationId: req.auth!.orgId,
          employeeId: req.params["employeeId"] as string,
        });
        res.json(result);
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    this.router.put(
      "/hr/schedules/base-schedule/:employeeId/:weekday",
      requireMinRole("manager"),
      async (req, res) => {
        try {
          const body = req.body as Record<string, unknown>;
          const weekday = Number(req.params["weekday"]);
          const result = await this.upsertBaseScheduleCell.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            employeeId: req.params["employeeId"] as string,
            weekday: weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6,
            isDayOff: body.isDayOff === true,
            ...(typeof body.startTime === "string" && { startTime: body.startTime }),
            ...(typeof body.endTime === "string" && { endTime: body.endTime }),
            ...(typeof body.locationId === "string" && { locationId: body.locationId }),
            ...(body.breakMinutes != null && { breakMinutes: Number(body.breakMinutes) }),
          });
          res.json(result);
        } catch (e) {
          const { status, body } = errorResponse(e);
          res.status(status).json(body);
        }
      },
    );

    this.router.post(
      "/hr/schedules/base-schedule/:employeeId/apply",
      requireMinRole("manager"),
      async (req, res) => {
        try {
          const body = req.body as Record<string, unknown>;
          const result = await this.applyBaseSchedule.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            employeeId: req.params["employeeId"] as string,
            weekStartDate: body.weekStartDate as string,
            ...(typeof body.overrideExceptions === "boolean" && { overrideExceptions: body.overrideExceptions }),
          });
          res.json(result);
        } catch (e) {
          const { status, body } = errorResponse(e);
          res.status(status).json(body);
        }
      },
    );

    // ── Turnos rotativos ──────────────────────────────────────────────────

    this.router.get("/hr/schedules/rotations", async (req, res) => {
      try {
        const result = await this.listShiftRotations.execute({ organizationId: req.auth!.orgId });
        res.json(result);
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    this.router.post("/hr/schedules/rotations", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const participantEmployeeIds = body.participantEmployeeIds as string[];
        if (!Array.isArray(participantEmployeeIds) || participantEmployeeIds.length !== 2) {
          res.status(400).json({ error: "participantEmployeeIds tem de ter exatamente 2 colaboradores" });
          return;
        }
        const result = await this.createShiftRotation.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          participantEmployeeIds: [participantEmployeeIds[0]!, participantEmployeeIds[1]!],
          patternA: body.patternA as { startTime: string; endTime: string; secondStartTime?: string | null; secondEndTime?: string | null },
          patternB: body.patternB as { startTime: string; endTime: string; secondStartTime?: string | null; secondEndTime?: string | null },
          locationId: body.locationId as string,
          anchorDate: body.anchorDate as string,
          ...(typeof body.autoSwitchWeekly === "boolean" && { autoSwitchWeekly: body.autoSwitchWeekly }),
        });
        res.status(201).json(result);
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    this.router.get("/hr/schedules/rotations/:id/preview", async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        const result = await this.previewShiftRotation.execute({
          organizationId: req.auth!.orgId,
          rotationId: req.params["id"] as string,
          ...(q.weeks && { weeks: Number(q.weeks) }),
        });
        res.json(result);
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    this.router.post("/hr/schedules/rotations/:id/apply", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await this.applyShiftRotation.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          rotationId: req.params["id"] as string,
          ...(typeof body.fromWeekStartDate === "string" && { fromWeekStartDate: body.fromWeekStartDate }),
          ...(body.weeks != null && { weeks: Number(body.weeks) }),
        });
        res.json(result);
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    this.router.patch("/hr/schedules/rotations/:id/active", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await this.setShiftRotationActive.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          rotationId: req.params["id"] as string,
          active: body.active === true,
        });
        res.json(result);
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    /** DELETE /api/hr/schedules/rotations/:id — apaga a rotação; os turnos já criados ficam na escala. */
    this.router.delete("/hr/schedules/rotations/:id", requireMinRole("manager"), async (req, res) => {
      try {
        await this.deleteShiftRotation.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          rotationId: req.params["id"] as string,
        });
        res.status(204).send();
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    // ── Alertas ───────────────────────────────────────────────────────────

    this.router.get("/hr/schedules/alerts", async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        if (!q.from || !q.to) {
          res.status(400).json({ error: "from e to são obrigatórios" });
          return;
        }
        const result = await this.getScheduleAlerts.execute({
          organizationId: req.auth!.orgId,
          from: q.from,
          to: q.to,
          ...(q.locationId && { locationId: q.locationId }),
        });
        res.json(result);
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    // ── "Novo turno" — padrão semanal / séries recorrentes ─────────────────

    this.router.post("/hr/schedules/work-shift-series/preview", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await this.previewWorkShiftSeries.execute({
          organizationId: req.auth!.orgId,
          employeeId: body.employeeId as string,
          locationId: body.locationId as string,
          startDate: body.startDate as string,
          rules: body.rules as never,
          repeat: body.repeat as never,
        });
        res.json(result);
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    this.router.post("/hr/schedules/work-shift-series", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await this.createWorkShiftSeries.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          employeeId: body.employeeId as string,
          locationId: body.locationId as string,
          startDate: body.startDate as string,
          rules: body.rules as never,
          repeat: body.repeat as never,
          publish: body.publish === true,
          force: body.force === true,
          ...("notes" in body && { notes: (body.notes as string | null) ?? null }),
        });
        res.status(201).json(result);
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    this.router.patch(
      "/hr/schedules/work-shifts/:id/series-scope",
      requireMinRole("manager"),
      async (req, res) => {
        try {
          const body = req.body as Record<string, unknown>;
          const scope = body.scope as string;
          if (!SERIES_EDIT_SCOPES.has(scope)) {
            res.status(400).json({ error: "scope inválido" });
            return;
          }
          const result = await this.updateWorkShiftSeriesScope.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            id: req.params["id"] as string,
            scope: scope as SeriesEditScope,
            ...(typeof body.startTime === "string" && { startTime: body.startTime }),
            ...(typeof body.endTime === "string" && { endTime: body.endTime }),
            ...(typeof body.endsNextDay === "boolean" && { endsNextDay: body.endsNextDay }),
            ...("secondStartTime" in body && { secondStartTime: (body.secondStartTime as string | null) ?? null }),
            ...("secondEndTime" in body && { secondEndTime: (body.secondEndTime as string | null) ?? null }),
            ...(typeof body.locationId === "string" && { locationId: body.locationId }),
            ...("notes" in body && { notes: (body.notes as string | null) ?? null }),
          });
          res.json(result);
        } catch (e) {
          const { status, body } = errorResponse(e);
          res.status(status).json(body);
        }
      },
    );

    this.router.post("/hr/schedules/work-shifts/clear/preview", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await this.previewClearWorkShifts.execute({
          organizationId: req.auth!.orgId,
          scope: readClearScope(body.scope),
        });
        res.json(result);
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    // "Desfazer" logo a seguir a apagar/limpar — repõe a partir da auditoria da própria operação.
    this.router.post("/hr/schedules/work-shifts/undo", requireMinRole("manager"), async (req, res) => {
      try {
        const token = (req.body as Record<string, unknown> | undefined)?.undoToken;
        if (typeof token !== "string" || token.length === 0) {
          res.status(400).json({ error: "undoToken em falta" });
          return;
        }
        res.json(await this.undoDeleteWorkShifts.execute({ organizationId: req.auth!.orgId, actor: req.auth!.email, undoToken: token }));
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    this.router.post("/hr/schedules/work-shifts/clear", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await this.clearWorkShifts.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          scope: readClearScope(body.scope),
        });
        res.json(result);
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    // ── "Repetir escala pelo calendário" ──────────────────────────────────

    this.router.post("/hr/schedules/work-shifts/repeat-week/preview", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await this.previewRepeatCalendarWeek.execute({
          organizationId: req.auth!.orgId,
          sourceWeekStartDate: body.sourceWeekStartDate as string,
          weekdays: body.weekdays as never,
          ...(Array.isArray(body.employeeIds) && { employeeIds: body.employeeIds as string[] }),
          ...(body.rotateEmployees === true && { rotateEmployees: true }),
          repeat: body.repeat as never,
        });
        res.json(result);
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });

    this.router.post("/hr/schedules/work-shifts/repeat-week", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await this.repeatCalendarWeek.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          sourceWeekStartDate: body.sourceWeekStartDate as string,
          weekdays: body.weekdays as never,
          ...(Array.isArray(body.employeeIds) && { employeeIds: body.employeeIds as string[] }),
          ...(body.rotateEmployees === true && { rotateEmployees: true }),
          repeat: body.repeat as never,
          publish: body.publish === true,
          force: body.force === true,
          ...("notes" in body && { notes: (body.notes as string | null) ?? null }),
        });
        res.status(201).json(result);
      } catch (e) {
        const { status, body } = errorResponse(e);
        res.status(status).json(body);
      }
    });
  }
}

