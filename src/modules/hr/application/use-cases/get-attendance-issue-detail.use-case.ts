import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../../../../utils/lisbonDayInstants.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";
import type { ShiftAttendanceReadPort } from "../../domain/ports/out/shift-attendance-read.port.js";
import type { LeaveReadPort } from "../../domain/ports/out/leave-read.port.js";
import type { AttendanceCorrectionRepositoryPort } from "../../domain/ports/out/attendance-correction-repository.port.js";
import { hasOverlappingOpenAttendance } from "../../domain/services/overview-shift-state.service.js";
import {
  computeAttendanceIssue,
  computeUnscheduledAttendanceIssue,
  describeAttendanceOccurrence,
} from "../../domain/services/attendance-conference.service.js";
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
  ) {}

  async execute(command: GetAttendanceIssueDetailCommand): Promise<AttendanceIssueDetailDTO | null> {
    const now = DateTime.now().setZone(REPORT_TIMEZONE);
    const range = { from: command.workDate, to: command.workDate };

    if (command.shiftId) {
      const [shifts, employees, leaves, locations] = await Promise.all([
        this.shiftAttendanceRead.findShiftsInRange(command.organizationId, range),
        this.employeeRepository.findMany(command.organizationId, { status: "all" }),
        this.leaveRead.findActiveInRange(command.organizationId, command.workDate, command.workDate),
        this.locationRepository.findAllForOrganization(command.organizationId),
      ]);
      const shift = shifts.find((s) => s.shiftId === command.shiftId);
      if (!shift) return null;

      const sameDayEmployeeShifts = shifts.filter((s) => s.employeeId === shift.employeeId);
      const hasOverlap = sameDayEmployeeShifts.length > 1 && hasOverlappingOpenAttendance(sameDayEmployeeShifts, now);
      const activeLeave = leaves.find((l) => l.employeeId === shift.employeeId) ?? null;
      const issue = computeAttendanceIssue(shift, now, { hasOverlap, activeLeave });
      if (!issue) return null;

      const corrections = shift.shiftId ? await this.attendanceCorrectionRepository.findByShiftId(command.organizationId, shift.shiftId) : [];
      const employeeNameById = new Map(employees.map((e) => [e.id, e.fullName]));
      const locationNameById = new Map(locations.map((l) => [l.id, l.name]));

      return {
        shiftId: issue.shiftId,
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
        corrections: [],
      };
    }

    return null;
  }
}
