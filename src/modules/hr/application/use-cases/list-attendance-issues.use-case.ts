import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../../../../utils/lisbonDayInstants.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";
import type { ShiftAttendanceReadPort, ShiftOccurrence } from "../../domain/ports/out/shift-attendance-read.port.js";
import type { LeaveReadPort, ActiveLeaveRange } from "../../domain/ports/out/leave-read.port.js";
import type { AttendanceRulesRepositoryPort } from "../../domain/ports/out/attendance-rules-repository.port.js";
import type { AttendanceCorrectionDTO, AttendanceCorrectionRepositoryPort } from "../../domain/ports/out/attendance-correction-repository.port.js";
import { attributeActualToPeriods, computeUnscheduledAttendanceIssue, describeAttendanceOccurrence } from "../../domain/services/attendance-conference.service.js";
import { hasOverlappingOpenAttendance } from "../../domain/services/overview-shift-state.service.js";
import { classifyScheduledShift } from "../../domain/services/attendance-occurrence.service.js";
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

/** Chave de correção — `hr_attendance_corrections` não tem `attendance_id`, só `work_shift_id`/`employee_id`+`work_date` (ver schema). */
function correctionKey(shiftId: string | null, employeeId: string, workDate: string): string {
  return shiftId ? `shift:${shiftId}` : `emp:${employeeId}:${workDate}`;
}

function latestCorrectionByKey(corrections: AttendanceCorrectionDTO[]): Map<string, AttendanceCorrectionDTO> {
  const map = new Map<string, AttendanceCorrectionDTO>();
  // `corrections` já vem ordenado created_at desc (ver listInRange) — a 1ª ocorrência de cada chave é a mais recente.
  for (const c of corrections) {
    const key = correctionKey(c.workShiftId, c.employeeId, c.workDate);
    if (!map.has(key)) map.set(key, c);
  }
  return map;
}

/**
 * "Conferência" (Fase 2 + Fase 2.1) — mostra situações que exigem
 * intervenção segundo DOIS sinais em paralelo (ver
 * `classifyScheduledShift`): o manual existente (pode não sinalizar
 * nada) e o automático novo por tolerância (nunca omisso). KPIs
 * calculados a partir da MESMA lista, sem 2ª agregação.
 */
export class ListAttendanceIssuesUseCase implements ListAttendanceIssuesPort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly shiftAttendanceRead: ShiftAttendanceReadPort,
    private readonly leaveRead: LeaveReadPort,
    private readonly locationRepository: LocationRepositoryPort,
    private readonly attendanceRulesRepository: AttendanceRulesRepositoryPort,
    private readonly attendanceCorrectionRepository: AttendanceCorrectionRepositoryPort,
  ) {}

  async execute(command: ListAttendanceIssuesCommand): Promise<ListAttendanceIssuesResultDTO> {
    const now = DateTime.now().setZone(REPORT_TIMEZONE);
    const { from, to } = monthRange(command.year, command.month);

    const [shifts, unscheduled, employees, leaves, locations, ruleVersions, corrections] = await Promise.all([
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
      // Fase 2.1 — dependências novas, tabelas ainda não migradas em todos os
      // ambientes: uma falha aqui nunca deve derrubar a Conferência (Fase 2,
      // já em produção). Sem regras → `resolveEffectiveRules` usa o default;
      // sem correções → todas as linhas ficam "pending", sem exclusão por
      // `justify_no_impact` — nunca `0`/dado inventado, só a classificação
      // por tolerância fica indisponível até a migração ser aplicada.
      this.attendanceRulesRepository.listVersions(command.organizationId).catch(() => []),
      this.attendanceCorrectionRepository.listInRange(command.organizationId, from, to).catch(() => []),
    ]);

    const employeeNameById = new Map(employees.map((e) => [e.id, e.fullName]));
    const locationNameById = new Map(locations.map((l) => [l.id, l.name]));
    const latestCorrectionByRowKey = latestCorrectionByKey(corrections);

    const overlapGroups = new Map<string, ShiftOccurrence[]>();
    for (const s of shifts) {
      const key = `${s.employeeId}:${s.workDate}`;
      const list = overlapGroups.get(key) ?? [];
      list.push(s);
      overlapGroups.set(key, list);
    }

    const items: AttendanceIssueRowDTO[] = [];

    for (const shift of shifts) {
      const key = `${shift.employeeId}:${shift.workDate}`;
      const group = overlapGroups.get(key)!;
      const hasOverlap = group.length > 1 && hasOverlappingOpenAttendance(group, now);
      const activeLeave = leaveCoversDate(leaves, shift.employeeId, shift.workDate);
      const classification = classifyScheduledShift(shift, now, { hasOverlap, activeLeave, ruleVersions });
      if (!classification) continue; // Regular — nem sinal manual nem tolerância acusam nada.

      const periods = attributeActualToPeriods(shift);
      const rowKey = correctionKey(shift.shiftId, shift.employeeId, shift.workDate);
      items.push({
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
        plannedMinutes: classification.issue?.plannedMinutes ?? 0,
        actualMinutes: classification.issue?.actualMinutes ?? 0,
        occurrenceKind: classification.occurrenceKind,
        diffMinutes: classification.diffMinutes,
        reviewStatus: latestCorrectionByRowKey.has(rowKey) ? "conferred" : "pending",
      });
    }

    for (const row of unscheduled) {
      const issue = computeUnscheduledAttendanceIssue(row);
      const rowKey = correctionKey(null, issue.employeeId, issue.workDate);
      items.push({
        shiftId: null,
        attendanceId: issue.attendanceId,
        employeeId: issue.employeeId,
        employeeName: employeeNameById.get(issue.employeeId) ?? issue.employeeId,
        workDate: issue.workDate,
        locationId: issue.locationId,
        locationName: issue.locationId ? (locationNameById.get(issue.locationId) ?? null) : null,
        endsNextDay: false,
        periods: issue.periods,
        state: issue.state,
        occurrenceLabel: describeAttendanceOccurrence(issue),
        plannedMinutes: issue.plannedMinutes,
        actualMinutes: issue.actualMinutes,
        occurrenceKind: "unscheduled_presence",
        diffMinutes: null,
        reviewStatus: latestCorrectionByRowKey.has(rowKey) ? "conferred" : "pending",
      });
    }

    items.sort((a, b) => (a.workDate === b.workDate ? 0 : a.workDate < b.workDate ? -1 : 1));

    // Conferência é uma fila de pendências (task, secção 3) — todos os KPIs contam só reviewStatus "pending".
    const pendingItems = items.filter((i) => i.reviewStatus === "pending");
    const lateDayKeys = new Set<string>();
    let lateMinutesTotal = 0;
    let lateOccurrencesCount = 0;
    let possibleAbsencesCount = 0;
    let noExitCount = 0;
    let conflictsCount = 0;
    for (const item of pendingItems) {
      if (item.occurrenceKind === "late_entry") {
        lateDayKeys.add(`${item.employeeId}:${item.workDate}`);
        lateOccurrencesCount += 1;
        if (item.diffMinutes != null && item.diffMinutes > 0) lateMinutesTotal += item.diffMinutes;
      }
      if (item.occurrenceKind === "absence") possibleAbsencesCount += 1;
      if (item.occurrenceKind === "no_exit") noExitCount += 1;
      if (item.occurrenceKind === "conflict") conflictsCount += 1;
    }

    const kpis: AttendanceIssuesKpisDTO = {
      pendingCount: pendingItems.length,
      lateDaysCount: lateDayKeys.size,
      lateMinutesTotal,
      lateOccurrencesCount,
      possibleAbsencesCount,
      noExitCount,
      conflictsCount,
    };

    return { items, kpis };
  }
}
