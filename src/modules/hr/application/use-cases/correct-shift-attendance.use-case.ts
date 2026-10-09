import { randomUUID } from "crypto";
import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../../../../utils/lisbonDayInstants.js";
import { AttendanceCorrectionReasonRequiredError, MonthlyClosureLockedError } from "../../domain/errors.js";
import type { AttendanceWritePort } from "../../domain/ports/out/attendance-write.port.js";
import type { AttendanceCorrectionRepositoryPort, AttendanceSnapshot } from "../../domain/ports/out/attendance-correction-repository.port.js";
import type { MonthlyClosureRepositoryPort } from "../../domain/ports/out/monthly-closure-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type {
  CorrectShiftAttendanceCommand,
  CorrectShiftAttendancePort,
  AttendanceIssueDetailDTO,
} from "../../domain/ports/in/attendance-conference.ports.js";
import { GetAttendanceIssueDetailUseCase } from "./get-attendance-issue-detail.use-case.js";

const CORRECTION_ACTION_LABELS: Record<string, string> = {
  keep_as_is: "Mantido como atraso",
  fix_times: "Entrada/saída corrigidas",
  justify_no_impact: "Ocorrência justificada (sem impacto nos KPIs)",
  mark_absence: "Período marcado como ausência",
  remove_marking: "Marcação removida",
};

/**
 * Único write path de assiduidade a partir do módulo novo (Fase 2) —
 * motivo sempre obrigatório, valor original sempre preservado
 * (`hr_attendance_corrections`), nunca escreve num mês fechado. A rota
 * legacy `PATCH /api/hr/shifts/:id/attendance` continua a existir só para
 * o `ShiftReviewModal` já existente (fora do escopo desta task).
 */
export class CorrectShiftAttendanceUseCase implements CorrectShiftAttendancePort {
  constructor(
    private readonly attendanceWrite: AttendanceWritePort,
    private readonly attendanceCorrectionRepository: AttendanceCorrectionRepositoryPort,
    private readonly monthlyClosureRepository: MonthlyClosureRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
    private readonly getAttendanceIssueDetail: GetAttendanceIssueDetailUseCase,
  ) {}

  async execute(command: CorrectShiftAttendanceCommand): Promise<AttendanceIssueDetailDTO | null> {
    if (!command.reason?.trim()) throw new AttendanceCorrectionReasonRequiredError();

    const workDate = DateTime.fromISO(command.workDate, { zone: REPORT_TIMEZONE });
    const closure = await this.monthlyClosureRepository.findByPeriod(command.organizationId, workDate.year, workDate.month);
    if (closure?.isClosed) throw new MonthlyClosureLockedError(workDate.year, workDate.month);

    const original = command.attendanceId ? await this.attendanceWrite.findById(command.organizationId, command.attendanceId) : null;

    let actualStartTime = original?.actualStartTime ?? null;
    let actualEndTime = original?.actualEndTime ?? null;
    let status = original?.status ?? "worked_as_planned";

    switch (command.correctionType) {
      case "fix_times":
        if (command.actualStartTime !== undefined) actualStartTime = command.actualStartTime;
        if (command.actualEndTime !== undefined) actualEndTime = command.actualEndTime;
        break;
      case "mark_absence":
        status = "cancelled";
        break;
      case "remove_marking":
        actualStartTime = null;
        actualEndTime = null;
        status = "worked_as_planned";
        break;
      case "keep_as_is":
      case "justify_no_impact":
        // Nenhuma alteração a hr_shift_attendance — só a trilha de correção/auditoria abaixo.
        // "justify_no_impact" exclui esta ocorrência dos KPIs de atraso/ausência
        // (ver list-attendance-issues.use-case.ts / get-monthly-attendance-summary.use-case.ts).
        break;
    }

    const originalSnapshot: AttendanceSnapshot | null = original
      ? { status: original.status, actualStartTime: original.actualStartTime, actualEndTime: original.actualEndTime }
      : null;
    const correctedSnapshot: AttendanceSnapshot = { status, actualStartTime, actualEndTime };

    const saved = await this.attendanceWrite.upsert(command.organizationId, {
      attendanceId: command.attendanceId,
      workShiftId: command.workShiftId,
      employeeId: command.employeeId,
      workDate: command.workDate,
      locationId: command.locationId,
      status,
      actualStartTime,
      actualEndTime,
      lateMinutes: command.lateMinutes !== undefined ? command.lateMinutes : (original?.lateMinutes ?? null),
      notes: command.notes ?? null,
      registrationSource: original?.registrationSource ?? "dashboard",
      registeredByEmployeeId: null,
    });

    await this.attendanceCorrectionRepository.record({
      organizationId: command.organizationId,
      workShiftId: command.workShiftId,
      employeeId: command.employeeId,
      workDate: command.workDate,
      correctionType: command.correctionType,
      original: originalSnapshot,
      corrected: correctedSnapshot,
      reason: command.reason,
      notes: command.notes ?? null,
      actor: command.actor,
      absenceId: command.absenceId ?? null,
    });

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "attendance_correction",
      entityId: saved.id,
      employeeId: command.employeeId,
      action: command.correctionType,
      description: `${CORRECTION_ACTION_LABELS[command.correctionType] ?? "Correção de assiduidade"} — ${command.reason}`,
      before: originalSnapshot,
      after: correctedSnapshot,
      correlationId: randomUUID(),
    });

    if (command.workShiftId) {
      return this.getAttendanceIssueDetail.execute({
        organizationId: command.organizationId,
        workDate: command.workDate,
        shiftId: command.workShiftId,
      });
    }
    return this.getAttendanceIssueDetail.execute({
      organizationId: command.organizationId,
      workDate: command.workDate,
      attendanceId: saved.id,
    });
  }
}
