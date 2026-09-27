import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../../../../utils/lisbonDayInstants.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";
import type { ShiftAttendanceReadPort, ShiftOccurrence } from "../../domain/ports/out/shift-attendance-read.port.js";
import type { LeaveReadPort, ActiveLeaveRange } from "../../domain/ports/out/leave-read.port.js";
import {
  computeAttendanceIssue,
  computeUnscheduledAttendanceIssue,
  describeAttendanceOccurrence,
  type AttendanceIssue,
} from "../../domain/services/attendance-conference.service.js";
import { hasOverlappingOpenAttendance } from "../../domain/services/overview-shift-state.service.js";
import type {
  AttendanceIssueRowDTO,
  AttendanceIssuesKpisDTO,
  ListAttendanceIssuesCommand,
  ListAttendanceIssuesPort,
  ListAttendanceIssuesResultDTO,
} from "../../domain/ports/in/attendance-conference.ports.js";

export function monthRange(year: number, month: number): { from: string; to: string } {
  const from = DateTime.fromObject({ year, month, day: 1 }, { zone: REPORT_TIMEZONE });
  return { from: from.toISODate()!, to: from.endOf("month").toISODate()! };
}

function leaveCoversDate(leaves: ActiveLeaveRange[], employeeId: string, workDate: string): ActiveLeaveRange | null {
  return leaves.find((l) => l.employeeId === employeeId && l.startDate <= workDate && workDate <= l.endDate) ?? null;
}

/**
 * "Conferência" (Fase 2) — só mostra situações que exigem intervenção
 * (secção 4); turnos "Regular" nunca aparecem aqui (filtrados por
 * `computeAttendanceIssue` devolver `null`). KPIs calculados a partir da
 * MESMA lista, sem 2ª agregação.
 */
export class ListAttendanceIssuesUseCase implements ListAttendanceIssuesPort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly shiftAttendanceRead: ShiftAttendanceReadPort,
    private readonly leaveRead: LeaveReadPort,
    private readonly locationRepository: LocationRepositoryPort,
  ) {}

  async execute(command: ListAttendanceIssuesCommand): Promise<ListAttendanceIssuesResultDTO> {
    const now = DateTime.now().setZone(REPORT_TIMEZONE);
    const { from, to } = monthRange(command.year, command.month);

    const [shifts, unscheduled, employees, leaves, locations] = await Promise.all([
      this.shiftAttendanceRead.findShiftsInRange(command.organizationId, {
        from,
        to,
        ...(command.locationId && { locationId: command.locationId }),
      }),
      this.shiftAttendanceRead.findUnscheduledInRange(command.organizationId, {
        from,
        to,
        ...(command.locationId && { locationId: command.locationId }),
      }),
      this.employeeRepository.findMany(command.organizationId, { status: "all" }),
      this.leaveRead.findActiveInRange(command.organizationId, from, to),
      this.locationRepository.findAllForOrganization(command.organizationId),
    ]);

    const employeeNameById = new Map(employees.map((e) => [e.id, e.fullName]));
    const locationNameById = new Map(locations.map((l) => [l.id, l.name]));

    const overlapGroups = new Map<string, ShiftOccurrence[]>();
    for (const s of shifts) {
      const key = `${s.employeeId}:${s.workDate}`;
      const list = overlapGroups.get(key) ?? [];
      list.push(s);
      overlapGroups.set(key, list);
    }

    const issues: AttendanceIssue[] = [];
    for (const shift of shifts) {
      const key = `${shift.employeeId}:${shift.workDate}`;
      const group = overlapGroups.get(key)!;
      const hasOverlap = group.length > 1 && hasOverlappingOpenAttendance(group, now);
      const activeLeave = leaveCoversDate(leaves, shift.employeeId, shift.workDate);
      const issue = computeAttendanceIssue(shift, now, { hasOverlap, activeLeave });
      if (issue) issues.push(issue);
    }
    for (const row of unscheduled) {
      issues.push(computeUnscheduledAttendanceIssue(row));
    }

    const items: AttendanceIssueRowDTO[] = issues
      .sort((a, b) => (a.workDate === b.workDate ? 0 : a.workDate < b.workDate ? -1 : 1))
      .map((issue) => ({
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
      }));

    // Horas realizadas/planeadas somam TODOS os turnos do mês (não só os
    // com pendência) — o Resumo mensal/Horas & saldos completos ficam para
    // a Fase B, mas os 2 números do topo da Conferência já podem ser
    // corretos agora, reaproveitando os mesmos períodos por turno.
    let plannedTotal = 0;
    let actualTotal = 0;
    for (const shift of shifts) {
      if (shift.attendanceStatus === "cancelled") continue;
      const periods = [
        { start: shift.startTime, end: shift.endTime },
        ...(shift.secondStartTime && shift.secondEndTime ? [{ start: shift.secondStartTime, end: shift.secondEndTime }] : []),
      ];
      for (const p of periods) plannedTotal += minutesBetween(p.start, p.end, shift.endsNextDay);
      if (shift.actualStartTime && shift.actualEndTime) {
        actualTotal += minutesBetween(shift.actualStartTime, shift.actualEndTime, shift.endsNextDay);
      }
    }

    const kpis: AttendanceIssuesKpisDTO = {
      pendingCount: items.length,
      lateCount: issues.filter((i) => i.occurrences.includes("ATRASO")).length,
      plannedMinutesTotal: plannedTotal,
      actualMinutesTotal: actualTotal,
      balanceMinutes: actualTotal - plannedTotal,
    };

    return { items, kpis };
  }
}

function minutesBetween(startHm: string, endHm: string, endsNextDay: boolean): number {
  const [sh, sm] = startHm.split(":").map(Number) as [number, number];
  const [eh, em] = endHm.split(":").map(Number) as [number, number];
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (endsNextDay || mins < 0) mins += 24 * 60;
  return mins;
}
