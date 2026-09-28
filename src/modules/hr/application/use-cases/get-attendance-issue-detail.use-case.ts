import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../../../../utils/lisbonDayInstants.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";
import type { ShiftAttendanceReadPort } from "../../domain/ports/out/shift-attendance-read.port.js";
import type { LeaveReadPort } from "../../domain/ports/out/leave-read.port.js";
import type { AttendanceCorrectionRepositoryPort } from "../../domain/ports/out/attendance-correction-repository.port.js";
import type { AttendanceRulesRepositoryPort } from "../../domain/ports/out/attendance-rules-repository.port.js";
import { hasOverlappingOpenAttendance } from "../../domain/services/overview-shift-state.service.js";
import {
  attributeActualToPeriods,
  computeUnscheduledAttendanceIssue,
  describeAttendanceOccurrence,
  sumActualMinutes,
  sumPlannedMinutes,
} from "../../domain/services/attendance-conference.service.js";
import { classifyScheduledShift } from "../../domain/services/attendance-occurrence.service.js";
import type {
  AttendanceIssueDetailDTO,
  GetAttendanceIssueDetailCommand,
  GetAttendanceIssueDetailPort,
} from "../../domain/ports/in/attendance-conference.ports.js";

/** Detalhe "Planeado x Registado x Resultado" (secção 5) + histórico de correções — busca 1 única ocorrência pelo dia exato (já conhecido da lista), sem paginar/varrer o mês inteiro. */
export class GetAttendanceIssueDetailUseCase implements GetAttendanceIssueDetailPort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly shiftAttendanceRead: ShiftAttendanceReadPort,
    private readonly leaveRead: LeaveReadPort,
    private readonly locationRepository: LocationRepositoryPort,
    private readonly attendanceCorrectionRepository: AttendanceCorrectionRepositoryPort,
    private readonly attendanceRulesRepository: AttendanceRulesRepositoryPort,
  ) {}

  async execute(command: GetAttendanceIssueDetailCommand): Promise<AttendanceIssueDetailDTO | null> {
    const now = DateTime.now().setZone(REPORT_TIMEZONE);
    const range = { from: command.workDate, to: command.workDate };

    if (command.shiftId) {
      const [shifts, employees, leaves, locations, ruleVersions] = await Promise.all([
        this.shiftAttendanceRead.findShiftsInRange(command.organizationId, range),
        this.employeeRepository.findMany(command.organizationId, { status: "all" }),
        this.leaveRead.findActiveInRange(command.organizationId, command.workDate, command.workDate),
        this.locationRepository.findAllForOrganization(command.organizationId),
        // Fase 2.1 — ver comentário equivalente em list-attendance-issues.use-case.ts.
        this.attendanceRulesRepository.listVersions(command.organizationId).catch(() => []),
      ]);
      const shift = shifts.find((s) => s.shiftId === command.shiftId);
      if (!shift) return null;

      const sameDayEmployeeShifts = shifts.filter((s) => s.employeeId === shift.employeeId);
      const hasOverlap = sameDayEmployeeShifts.length > 1 && hasOverlappingOpenAttendance(sameDayEmployeeShifts, now);
      const activeLeave = leaves.find((l) => l.employeeId === shift.employeeId) ?? null;
      const classification = classifyScheduledShift(shift, now, { hasOverlap, activeLeave, ruleVersions });
      if (!classification) return null; // Regular — nem sinal manual nem tolerância acusam nada.

      const periods = attributeActualToPeriods(shift);
      const plannedMinutes = sumPlannedMinutes(periods, shift.endsNextDay);
      const actualMinutes = sumActualMinutes(periods, shift.endsNextDay);

      const corrections = shift.shiftId ? await this.attendanceCorrectionRepository.findByShiftId(command.organizationId, shift.shiftId) : [];
      const employeeNameById = new Map(employees.map((e) => [e.id, e.fullName]));
      const locationNameById = new Map(locations.map((l) => [l.id, l.name]));

      return {
        shiftId: shift.shiftId,
        attendanceId: shift.attendanceId ?? null,
        employeeId: shift.employeeId,
        employeeName: employeeNameById.get(shift.employeeId) ?? shift.employeeId,
        workDate: shift.workDate,
        locationId: shift.locationId,
        locationName: shift.locationId ? (locationNameById.get(shift.locationId) ?? null) : null,
        endsNextDay: shift.endsNextDay,
        periods,
        state: classification.state,
        occurrenceLabel: classification.occurrenceLabel,
        plannedMinutes,
        actualMinutes,
        diffMinutes: actualMinutes - plannedMinutes,
        occurrenceKind: classification.occurrenceKind,
        reviewStatus: corrections.length > 0 ? "conferred" : "pending",
        corrections: corrections.map((c) => ({
          id: c.id,
          createdAt: c.createdAt,
          correctionType: c.correctionType,
          original: c.original,
          corrected: c.corrected,
          reason: c.reason,
          notes: c.notes,
          actor: c.actor,
        })),
      };
    }

    if (command.attendanceId) {
      const [unscheduled, employees, locations] = await Promise.all([
        this.shiftAttendanceRead.findUnscheduledInRange(command.organizationId, range),
        this.employeeRepository.findMany(command.organizationId, { status: "all" }),
        this.locationRepository.findAllForOrganization(command.organizationId),
      ]);
      const row = unscheduled.find((u) => u.attendanceId === command.attendanceId);
      if (!row) return null;

      const issue = computeUnscheduledAttendanceIssue(row);
      const employeeNameById = new Map(employees.map((e) => [e.id, e.fullName]));
      const locationNameById = new Map(locations.map((l) => [l.id, l.name]));
      // `hr_attendance_corrections` não tem `attendance_id` — presença sem escala é identificada por employee_id+work_date (ver schema).
      const correctionsInRange = await this.attendanceCorrectionRepository.listInRange(command.organizationId, command.workDate, command.workDate);
      const corrections = correctionsInRange.filter((c) => c.workShiftId === null && c.employeeId === issue.employeeId);

      return {
        shiftId: null,
        attendanceId: issue.attendanceId,
        employeeId: issue.employeeId,
        employeeName: employeeNameById.get(issue.employeeId) ?? issue.employeeId,
        workDate: issue.workDate,
        locationId: issue.locationId,
        locationName: issue.locationId ? (locationNameById.get(issue.locationId) ?? null) : null,
        endsNextDay: issue.endsNextDay,
        periods: issue.periods,
        state: issue.state,
        occurrenceLabel: describeAttendanceOccurrence(issue),
        plannedMinutes: issue.plannedMinutes,
        actualMinutes: issue.actualMinutes,
        diffMinutes: issue.actualMinutes - issue.plannedMinutes,
        occurrenceKind: "unscheduled_presence",
        reviewStatus: corrections.length > 0 ? "conferred" : "pending",
        corrections: corrections.map((c) => ({
          id: c.id,
          createdAt: c.createdAt,
          correctionType: c.correctionType,
          original: c.original,
          corrected: c.corrected,
          reason: c.reason,
          notes: c.notes,
          actor: c.actor,
        })),
      };
    }

    return null;
  }
}
