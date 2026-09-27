import { Router } from "express";
import { requireMinRole } from "../../../../middleware/auth.js";
import {
  AttendanceCorrectionReasonRequiredError,
  MonthlyClosureHasBlockersError,
  MonthlyClosureLockedError,
  MonthlyClosureNotFoundError,
  MonthlyClosureReopenReasonRequiredError,
} from "../../domain/errors.js";
import type { AttendanceCorrectionType } from "../../domain/ports/out/attendance-correction-repository.port.js";
import type {
  ListAttendanceIssuesPort,
  GetAttendanceIssueDetailPort,
  CorrectShiftAttendancePort,
  GetMonthlyClosureStatusPort,
  CloseMonthlyPeriodPort,
  ReopenMonthlyPeriodPort,
} from "../../domain/ports/in/attendance-conference.ports.js";

const CORRECTION_TYPES = new Set<string>(["add_entry", "add_exit", "fix_entry", "fix_exit", "mark_absence", "confirm", "observation"]);

export class HrAttendanceController {
  readonly router: Router;

  constructor(
    private readonly listAttendanceIssues: ListAttendanceIssuesPort,
    private readonly getAttendanceIssueDetail: GetAttendanceIssueDetailPort,
    private readonly correctShiftAttendance: CorrectShiftAttendancePort,
    private readonly getMonthlyClosureStatus: GetMonthlyClosureStatusPort,
    private readonly closeMonthlyPeriod: CloseMonthlyPeriodPort,
    private readonly reopenMonthlyPeriod: ReopenMonthlyPeriodPort,
  ) {
    this.router = Router();
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
    this.router.post("/hr/attendance/closure/reopen", requireMinRole("admin"), async (req, res) => {
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
  }
}
