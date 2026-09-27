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
  add_entry: "Entrada adicionada",
  add_exit: "Saída adicionada",
  fix_entry: "Entrada corrigida",
  fix_exit: "Saída corrigida",
  mark_absence: "Período marcado como ausência",
  confirm: "Registos confirmados",
  observation: "Observação adicionada",
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
      case "add_entry":
      case "fix_entry":
        actualStartTime = command.actualStartTime ?? null;
        break;
      case "add_exit":
      case "fix_exit":
        actualEndTime = command.actualEndTime ?? null;
        break;
      case "mark_absence":
        status = "cancelled";
        break;
      case "confirm":
      case "observation":
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
