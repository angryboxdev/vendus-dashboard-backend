import { Router } from "express";
import { requireMinRole } from "../../../../middleware/auth.js";
import {
  AttendanceCorrectionReasonRequiredError,
  MonthlyClosureHasBlockersError,
  MonthlyClosureLockedError,
  MonthlyClosureNotFoundError,
  MonthlyClosureReopenReasonRequiredError,
  InvalidWorkdayRulesError,
  ConfirmAbsenceChoiceRequiredError,
  PendingAbsenceRequestError,
} from "../../domain/errors.js";
import { InvalidAbsenceError } from "../../domain/entities/absence.js";
import type { ConfirmAbsencePort, OccurrenceRef, PreviewConfirmAbsencePort } from "../../domain/ports/in/confirm-absence.ports.js";
import type { LeaveType } from "../../domain/ports/out/leave-read.port.js";
import type { AttendanceCorrectionType } from "../../domain/ports/out/attendance-correction-repository.port.js";
import type {
  ListAttendanceIssuesPort,
  GetAttendanceIssueDetailPort,
  CorrectShiftAttendancePort,
  GetMonthlyClosureStatusPort,
  CloseMonthlyPeriodPort,
  ReopenMonthlyPeriodPort,
} from "../../domain/ports/in/attendance-conference.ports.js";
import type { GetAttendanceRulesPort, ListAttendanceRuleChangesPort, UpdateAttendanceRulesPort } from "../../domain/ports/in/attendance-rules.ports.js";
import type { GetMonthlyAttendanceSummaryPort } from "../../domain/ports/in/attendance-summary.ports.js";
import type { GetAttendanceEmployeeDetailPort } from "../../domain/ports/in/attendance-employee-detail.ports.js";

const CORRECTION_TYPES = new Set<string>(["keep_as_is", "fix_times", "justify_no_impact", "mark_absence", "remove_marking"]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export class HrAttendanceController {
  readonly router: Router;

  constructor(
    private readonly listAttendanceIssues: ListAttendanceIssuesPort,
    private readonly getAttendanceIssueDetail: GetAttendanceIssueDetailPort,
    private readonly correctShiftAttendance: CorrectShiftAttendancePort,
    private readonly getMonthlyClosureStatus: GetMonthlyClosureStatusPort,
    private readonly closeMonthlyPeriod: CloseMonthlyPeriodPort,
    private readonly reopenMonthlyPeriod: ReopenMonthlyPeriodPort,
    private readonly getAttendanceRules: GetAttendanceRulesPort,
    private readonly updateAttendanceRules: UpdateAttendanceRulesPort,
    private readonly listAttendanceRuleChanges: ListAttendanceRuleChangesPort,
    private readonly getMonthlyAttendanceSummary: GetMonthlyAttendanceSummaryPort,
    private readonly getAttendanceEmployeeDetail: GetAttendanceEmployeeDetailPort,
    private readonly previewConfirmAbsence: PreviewConfirmAbsencePort,
    private readonly confirmAbsence: ConfirmAbsencePort,
  ) {
    this.router = Router();

    const occurrenceOf = (b: Record<string, unknown>): OccurrenceRef => ({
      workShiftId: typeof b.workShiftId === "string" ? b.workShiftId : null,
      attendanceId: typeof b.attendanceId === "string" ? b.attendanceId : null,
      employeeId: String(b.employeeId ?? ""),
      workDate: String(b.workDate ?? ""),
      locationId: String(b.locationId ?? ""),
    });
    const confirmError = (e: unknown, res: import("express").Response) => {
      if (e instanceof PendingAbsenceRequestError) {
        res.status(409).json({ error: e.message, code: "PENDING_REQUEST", requestId: e.requestId });
        return;
      }
      if (e instanceof ConfirmAbsenceChoiceRequiredError) {
        res.status(409).json({ error: e.message, code: "CHOICE_REQUIRED" });
        return;
      }
      if (e instanceof InvalidAbsenceError || e instanceof AttendanceCorrectionReasonRequiredError) {
        res.status(400).json({ error: e.message });
        return;
      }
      if (e instanceof MonthlyClosureLockedError) {
        res.status(409).json({ error: e.message });
        return;
      }
      res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
    };

    /** POST /api/hr/attendance/confirm-absence/preview — há ausência compatível? (não grava nada) */
    this.router.post("/hr/attendance/confirm-absence/preview", async (req, res) => {
      try {
        res.json(await this.previewConfirmAbsence.execute({ organizationId: req.auth!.orgId, ...occurrenceOf(req.body ?? {}) }));
      } catch (e) {
        confirmError(e, res);
      }
    });

    /** POST /api/hr/attendance/confirm-absence — vincula a existente ou cria UMA nova e resolve a ocorrência. */
    this.router.post("/hr/attendance/confirm-absence", async (req, res) => {
      try {
        const b = (req.body ?? {}) as Record<string, unknown>;
        const n = b.newAbsence as Record<string, unknown> | undefined;
        res.json(
          await this.confirmAbsence.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            ...occurrenceOf(b),
            ...(typeof b.absenceId === "string" && { absenceId: b.absenceId }),
            ...(n && {
              newAbsence: {
                type: String(n.type) as LeaveType,
                startTime: typeof n.startTime === "string" ? n.startTime : null,
                endTime: typeof n.endTime === "string" ? n.endTime : null,
                notes: typeof n.notes === "string" ? n.notes : null,
              },
            }),
          }),
        );
      } catch (e) {
        confirmError(e, res);
      }
    });
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /** GET /api/hr/attendance/issues?year=&month=&locationId= — "Conferência" (Fase 2). */
    this.router.get("/hr/attendance/issues", async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        const year = Number(q.year);
        const month = Number(q.month);
        if (!year || !month) {
          res.status(400).json({ error: "year e month são obrigatórios" });
          return;
        }
        const result = await this.listAttendanceIssues.execute({
          organizationId: req.auth!.orgId,
          year,
          month,
          ...(q.locationId && { locationId: q.locationId }),
        });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** GET /api/hr/attendance/issues/detail?workDate=&shiftId=|attendanceId= */
    this.router.get("/hr/attendance/issues/detail", async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        if (!q.workDate || (!q.shiftId && !q.attendanceId)) {
          res.status(400).json({ error: "workDate e (shiftId ou attendanceId) são obrigatórios" });
          return;
        }
        const result = await this.getAttendanceIssueDetail.execute({
          organizationId: req.auth!.orgId,
          workDate: q.workDate,
          ...(q.shiftId && { shiftId: q.shiftId }),
          ...(q.attendanceId && { attendanceId: q.attendanceId }),
        });
        if (!result) {
          res.status(404).json({ error: "Ocorrência não encontrada" });
          return;
        }
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** POST /api/hr/attendance/issues/correct — única via de correção manual (motivo sempre obrigatório). */
    this.router.post("/hr/attendance/issues/correct", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.correctionType !== "string" || !CORRECTION_TYPES.has(body.correctionType)) {
          res.status(400).json({ error: "correctionType inválido" });
          return;
        }
        if (typeof body.employeeId !== "string" || typeof body.workDate !== "string" || typeof body.locationId !== "string") {
          res.status(400).json({ error: "employeeId, workDate e locationId são obrigatórios" });
          return;
        }
        const result = await this.correctShiftAttendance.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          workShiftId: typeof body.workShiftId === "string" ? body.workShiftId : null,
          attendanceId: typeof body.attendanceId === "string" ? body.attendanceId : null,
          employeeId: body.employeeId,
          workDate: body.workDate,
          locationId: body.locationId,
          correctionType: body.correctionType as AttendanceCorrectionType,
          ...(body.actualStartTime !== undefined && { actualStartTime: body.actualStartTime as string | null }),
          ...(body.actualEndTime !== undefined && { actualEndTime: body.actualEndTime as string | null }),
          ...(body.lateMinutes !== undefined && { lateMinutes: body.lateMinutes as number | null }),
          reason: typeof body.reason === "string" ? body.reason : "",
          ...(body.notes !== undefined && { notes: body.notes as string | null }),
        });
        res.json(result);
      } catch (e) {
        if (e instanceof AttendanceCorrectionReasonRequiredError) {
          res.status(400).json({ error: e.message });
          return;
        }
        if (e instanceof MonthlyClosureLockedError) {
          res.status(409).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** GET /api/hr/attendance/closure?year=&month= — rodapé "Fecho mensal". */
    this.router.get("/hr/attendance/closure", async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        const year = Number(q.year);
        const month = Number(q.month);
        if (!year || !month) {
          res.status(400).json({ error: "year e month são obrigatórios" });
          return;
        }
        const result = await this.getMonthlyClosureStatus.execute({ organizationId: req.auth!.orgId, year, month });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** POST /api/hr/attendance/closure/close — bloqueia com pendências (secção 21). */
    this.router.post("/hr/attendance/closure/close", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as { year?: number; month?: number };
        if (!body.year || !body.month) {
          res.status(400).json({ error: "year e month são obrigatórios" });
          return;
        }
        const result = await this.closeMonthlyPeriod.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          year: body.year,
          month: body.month,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof MonthlyClosureHasBlockersError) {
          res.status(409).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** POST /api/hr/attendance/closure/reopen — só role mais alto (secção 23), exige motivo. */
    this.router.post("/hr/attendance/closure/reopen", async (req, res) => {
      try {
        const body = req.body as { year?: number; month?: number; reason?: string };
        if (!body.year || !body.month) {
          res.status(400).json({ error: "year e month são obrigatórios" });
          return;
        }
        const result = await this.reopenMonthlyPeriod.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          year: body.year,
          month: body.month,
          reason: body.reason ?? "",
        });
        res.json(result);
      } catch (e) {
        if (e instanceof MonthlyClosureReopenReasonRequiredError) {
          res.status(400).json({ error: e.message });
          return;
        }
        if (e instanceof MonthlyClosureNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** GET /api/hr/attendance/rules — Fase 2.1, "Configurar regras". */
    this.router.get("/hr/attendance/rules", async (req, res) => {
      try {
        const result = await this.getAttendanceRules.execute({ organizationId: req.auth!.orgId });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** PUT /api/hr/attendance/rules — insere uma nova versão (nunca sobrescreve a anterior). */
    this.router.put("/hr/attendance/rules", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const fields = [
          "entryToleranceMinutes",
          "earlyExitToleranceMinutes",
          "absenceThresholdMinutes",
          "preShiftWindowMinutes",
          "postShiftWindowMinutes",
          "standardShiftMinutes",
          "closingToleranceMinutes",
          "doubleShiftFromMinutes",
        ] as const;
        for (const field of fields) {
          if (!isFiniteNumber(body[field]) || (body[field] as number) < 0) {
            res.status(400).json({ error: `${field} deve ser um número >= 0` });
            return;
          }
        }
        if (body.controlStartDate !== undefined && body.controlStartDate !== null && typeof body.controlStartDate !== "string") {
          res.status(400).json({ error: "controlStartDate deve ser uma data (YYYY-MM-DD) ou null" });
          return;
        }
        const result = await this.updateAttendanceRules.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          entryToleranceMinutes: body.entryToleranceMinutes as number,
          earlyExitToleranceMinutes: body.earlyExitToleranceMinutes as number,
          absenceThresholdMinutes: body.absenceThresholdMinutes as number,
          preShiftWindowMinutes: body.preShiftWindowMinutes as number,
          postShiftWindowMinutes: body.postShiftWindowMinutes as number,
          standardShiftMinutes: body.standardShiftMinutes as number,
          closingToleranceMinutes: body.closingToleranceMinutes as number,
          doubleShiftFromMinutes: body.doubleShiftFromMinutes as number,
          controlStartDate: (body.controlStartDate as string | null | undefined) ?? null,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof InvalidWorkdayRulesError) {
          res.status(400).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** GET /api/hr/attendance/rules/history — Fase 2.1, auditoria por campo. */
    this.router.get("/hr/attendance/rules/history", async (req, res) => {
      try {
        const result = await this.listAttendanceRuleChanges.execute({ organizationId: req.auth!.orgId });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** GET /api/hr/attendance/summary?year=&month=&locationId= — Fase 2.1, "Resumo mensal". */
    this.router.get("/hr/attendance/summary", async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        const year = Number(q.year);
        const month = Number(q.month);
        if (!year || !month) {
          res.status(400).json({ error: "year e month são obrigatórios" });
          return;
        }
        const result = await this.getMonthlyAttendanceSummary.execute({
          organizationId: req.auth!.orgId,
          year,
          month,
          ...(q.locationId && { locationId: q.locationId }),
        });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** GET /api/hr/attendance/employee/:employeeId?year=&month= — ficha individual ("Assiduidade — Nome"). */
    this.router.get("/hr/attendance/employee/:employeeId", async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        const year = Number(q.year);
        const month = Number(q.month);
        if (!year || !month) {
          res.status(400).json({ error: "year e month são obrigatórios" });
          return;
        }
        const result = await this.getAttendanceEmployeeDetail.execute({
          organizationId: req.auth!.orgId,
          employeeId: req.params.employeeId!,
          year,
          month,
        });
        if (!result) {
          res.status(404).json({ error: "Colaborador não encontrado" });
          return;
        }
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });
  }
}
