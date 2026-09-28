import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../../../../utils/lisbonDayInstants.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";
import type { ShiftAttendanceReadPort, ShiftOccurrence } from "../../domain/ports/out/shift-attendance-read.port.js";
import type { LeaveReadPort, ActiveLeaveRange } from "../../domain/ports/out/leave-read.port.js";
import type { AttendanceRulesRepositoryPort } from "../../domain/ports/out/attendance-rules-repository.port.js";
import type { AttendanceCorrectionDTO, AttendanceCorrectionRepositoryPort } from "../../domain/ports/out/attendance-correction-repository.port.js";
import { attributeActualToPeriods, sumActualMinutes, sumPlannedMinutes } from "../../domain/services/attendance-conference.service.js";
import { hasOverlappingOpenAttendance } from "../../domain/services/overview-shift-state.service.js";
import { classifyScheduledShift } from "../../domain/services/attendance-occurrence.service.js";
import { monthRange } from "./list-attendance-issues.use-case.js";
import type {
  AttendanceEmployeeDetailResultDTO,
  GetAttendanceEmployeeDetailCommand,
  GetAttendanceEmployeeDetailPort,
} from "../../domain/ports/in/attendance-employee-detail.ports.js";
import type { AttendanceIssueRowDTO } from "../../domain/ports/in/attendance-conference.ports.js";

function leaveCoversDate(leaves: ActiveLeaveRange[], employeeId: string, workDate: string): ActiveLeaveRange | null {
  return leaves.find((l) => l.employeeId === employeeId && l.startDate <= workDate && workDate <= l.endDate) ?? null;
}

function correctionKey(workShiftId: string | null, employeeId: string, workDate: string): string {
  return workShiftId ? `shift:${workShiftId}` : `emp:${employeeId}:${workDate}`;
}

function latestCorrectionByKey(corrections: AttendanceCorrectionDTO[]): Map<string, AttendanceCorrectionDTO> {
  const map = new Map<string, AttendanceCorrectionDTO>();
  for (const c of corrections) {
    const key = correctionKey(c.workShiftId, c.employeeId, c.workDate);
    if (!map.has(key)) map.set(key, c);
  }
  return map;
}

/**
 * Ficha individual — "Assiduidade — Nome" (task "Assiduidade —
 * Conferência, Por Colaborador e Horas & Saldos", secções 18/19).
 * Reaproveita `classifyScheduledShift` (nunca duplica a regra de
 * tolerância) mas, ao contrário da Conferência, NUNCA pula um turno
 * "Regular" — o extrato diário mostra o mês completo. Known gap: não
 * sintetiza linhas "Folga" para dias sem nenhum `WorkShift`/presença
 * registados (exigiria reconstruir a escala base/feriados aqui também —
 * fora do âmbito desta ronda) — só mostra dias com registo real.
 */
export class GetAttendanceEmployeeDetailUseCase implements GetAttendanceEmployeeDetailPort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly shiftAttendanceRead: ShiftAttendanceReadPort,
    private readonly leaveRead: LeaveReadPort,
    private readonly locationRepository: LocationRepositoryPort,
    private readonly attendanceRulesRepository: AttendanceRulesRepositoryPort,
    private readonly attendanceCorrectionRepository: AttendanceCorrectionRepositoryPort,
  ) {}

  async execute(command: GetAttendanceEmployeeDetailCommand): Promise<AttendanceEmployeeDetailResultDTO | null> {
    const now = DateTime.now().setZone(REPORT_TIMEZONE);
    const today = now.toISODate()!;
    const { from, to } = monthRange(command.year, command.month);

    const [allShifts, allUnscheduled, employees, locations, leaves, ruleVersions, corrections] = await Promise.all([
      this.shiftAttendanceRead.findShiftsInRange(command.organizationId, { from, to }),
      this.shiftAttendanceRead.findUnscheduledInRange(command.organizationId, { from, to }),
      this.employeeRepository.findMany(command.organizationId, { status: "all" }),
      this.locationRepository.findAllForOrganization(command.organizationId),
      this.leaveRead.findActiveInRange(command.organizationId, from, to),
      this.attendanceRulesRepository.listVersions(command.organizationId).catch(() => []),
      this.attendanceCorrectionRepository.listInRange(command.organizationId, from, to).catch(() => []),
    ]);

    const employee = employees.find((e) => e.id === command.employeeId);
    if (!employee) return null;

    const locationNameById = new Map(locations.map((l) => [l.id, l.name]));
    const latestCorrectionByRowKey = latestCorrectionByKey(corrections);
    const shifts = allShifts.filter((s) => s.employeeId === command.employeeId);
    const unscheduled = allUnscheduled.filter((u) => u.employeeId === command.employeeId);

    const overlapGroups = new Map<string, ShiftOccurrence[]>();
    for (const s of shifts) {
      const list = overlapGroups.get(s.workDate) ?? [];
      list.push(s);
      overlapGroups.set(s.workDate, list);
    }

    const rows: AttendanceIssueRowDTO[] = [];
    let plannedShiftsCount = 0;
    let actualShiftsCount = 0;
    let pendingCount = 0;
    let plannedMinutes = 0;
    let plannedMinutesToDate = 0;
    let actualMinutesConfirmed = 0;
    const lateDayKeys = new Set<string>();
    let lateMinutesTotal = 0;
    const absenceDayKeys = new Set<string>();

    for (const shift of shifts) {
      if (shift.attendanceStatus === "cancelled") continue;
      plannedShiftsCount += 1;
      const periods = attributeActualToPeriods(shift);
      const shiftPlanned = sumPlannedMinutes(periods, shift.endsNextDay);
      const shiftActual = sumActualMinutes(periods, shift.endsNextDay);
      plannedMinutes += shiftPlanned;
      if (shift.workDate <= today) plannedMinutesToDate += shiftPlanned;
      if (shift.actualStartTime && shift.actualEndTime) actualShiftsCount += 1;

      const group = overlapGroups.get(shift.workDate)!;
      const hasOverlap = group.length > 1 && hasOverlappingOpenAttendance(group, now);
      const activeLeave = leaveCoversDate(leaves, shift.employeeId, shift.workDate);
      const classification = classifyScheduledShift(shift, now, { hasOverlap, activeLeave, ruleVersions });

      const rowKey = correctionKey(shift.shiftId, shift.employeeId, shift.workDate);
      const latest = latestCorrectionByRowKey.get(rowKey);
      const reviewStatus: "pending" | "conferred" = classification && !latest ? "pending" : "conferred";
      if (reviewStatus === "pending") pendingCount += 1;
      if (reviewStatus === "conferred") actualMinutesConfirmed += shiftActual;

      if (classification && latest?.correctionType !== "justify_no_impact") {
        if (classification.occurrenceKind === "late_entry") {
          lateDayKeys.add(shift.workDate);
          if (classification.diffMinutes != null && classification.diffMinutes > 0) lateMinutesTotal += classification.diffMinutes;
        }
        if (classification.occurrenceKind === "absence") absenceDayKeys.add(shift.workDate);
      }

      rows.push({
        shiftId: shift.shiftId,
        attendanceId: shift.attendanceId ?? null,
        employeeId: shift.employeeId,
        employeeName: employee.fullName,
        workDate: shift.workDate,
        locationId: shift.locationId,
        locationName: shift.locationId ? (locationNameById.get(shift.locationId) ?? null) : null,
        endsNextDay: shift.endsNextDay,
        periods,
        state: classification?.state ?? "REGULAR",
        occurrenceLabel: classification?.occurrenceLabel ?? "Regular",
        plannedMinutes: shiftPlanned,
        actualMinutes: shiftActual,
        occurrenceKind: classification?.occurrenceKind ?? "ok",
        diffMinutes: classification?.diffMinutes ?? null,
        reviewStatus,
      });
    }

    for (const row of unscheduled) {
      const rowKey = correctionKey(null, row.employeeId, row.workDate);
      const latest = latestCorrectionByRowKey.get(rowKey);
      const periods = [{ plannedStart: null, plannedEnd: null, actualStart: row.actualStartTime, actualEnd: row.actualEndTime }];
      const actualMinutes = row.actualStartTime && row.actualEndTime ? sumActualMinutes(periods, false) : 0;
      const reviewStatus: "pending" | "conferred" = latest ? "conferred" : "pending";
      if (reviewStatus === "pending") pendingCount += 1;
      if (reviewStatus === "conferred") actualMinutesConfirmed += actualMinutes;

      rows.push({
        shiftId: null,
        attendanceId: row.attendanceId,
        employeeId: row.employeeId,
        employeeName: employee.fullName,
        workDate: row.workDate,
        locationId: row.locationId,
        locationName: row.locationId ? (locationNameById.get(row.locationId) ?? null) : null,
        endsNextDay: false,
        periods,
        state: "CONFLITO",
        occurrenceLabel: "Presença sem escala",
        plannedMinutes: 0,
        actualMinutes,
        occurrenceKind: "unscheduled_presence",
        diffMinutes: null,
        reviewStatus,
      });
    }

    rows.sort((a, b) => (a.workDate === b.workDate ? 0 : a.workDate < b.workDate ? -1 : 1));

    return {
      employeeId: employee.id,
      employeeName: employee.fullName,
      kpis: {
        plannedShiftsCount,
        actualShiftsCount,
        pendingCount,
        lateDaysCount: lateDayKeys.size,
        lateMinutesTotal,
        absenceDaysCount: absenceDayKeys.size,
        plannedMinutes,
        actualMinutesConfirmed,
        balanceConfirmed: actualMinutesConfirmed - plannedMinutesToDate,
      },
      rows,
    };
  }
}
