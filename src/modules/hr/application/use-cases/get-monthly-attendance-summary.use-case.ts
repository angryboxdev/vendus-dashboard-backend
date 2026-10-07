import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../../../../utils/lisbonDayInstants.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { ShiftAttendanceReadPort } from "../../domain/ports/out/shift-attendance-read.port.js";
import type { LeaveReadPort, ActiveLeaveRange } from "../../domain/ports/out/leave-read.port.js";
import type { AttendanceRulesRepositoryPort } from "../../domain/ports/out/attendance-rules-repository.port.js";
import type { AttendanceCorrectionDTO, AttendanceCorrectionRepositoryPort } from "../../domain/ports/out/attendance-correction-repository.port.js";
import type { MonthlyClosureRepositoryPort } from "../../domain/ports/out/monthly-closure-repository.port.js";
import { attributeActualToPeriods, sumActualMinutes, sumPlannedMinutes } from "../../domain/services/attendance-conference.service.js";
import { hasOverlappingOpenAttendance } from "../../domain/services/overview-shift-state.service.js";
import { classifyScheduledShift } from "../../domain/services/attendance-occurrence.service.js";
import { resolveEffectiveRules } from "../../domain/services/attendance-tolerance.service.js";
import { summarizeWorkdays } from "../../domain/services/workday.service.js";
import { monthRange } from "./list-attendance-issues.use-case.js";
import type {
  AttendanceEmployeeStatusDTO,
  GetMonthlyAttendanceSummaryCommand,
  GetMonthlyAttendanceSummaryPort,
  MonthlyAttendanceSummaryResultDTO,
  MonthlyAttendanceSummaryRowDTO,
} from "../../domain/ports/in/attendance-summary.ports.js";

/** Kinds "graves" — task não define fórmula para o Estado por colaborador (secção 17, só nomeia os 3 estados); decisão própria, documentada no README. */
const SEVERE_PENDING_KINDS = new Set(["absence", "conflict", "no_exit"]);

function workdayColumns(entries: Accumulator["workedEntries"], rulesFor: Parameters<typeof summarizeWorkdays>[1]) {
  const t = summarizeWorkdays(entries, rulesFor);
  return { workedDaysCount: t.days, shiftEquivalents: t.shiftEquivalents, oneAndHalfDaysCount: t.oneAndHalfDays, doubleDaysCount: t.doubleDays };
}

/** `pendingCount === 0` → pronto para fecho; senão, requer atenção se houver algo grave pendente ou muitos dias em atraso; senão só pendências. */
export function deriveEmployeeStatus(pendingCount: number, lateDaysCount: number, hasSeverePending: boolean): AttendanceEmployeeStatusDTO {
  if (pendingCount === 0) return "pronto_para_fecho";
  if (hasSeverePending || lateDaysCount >= 3) return "requer_atencao";
  return "pendencias";
}

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

interface Accumulator {
  employeeId: string;
  plannedShiftsCount: number;
  actualShiftsCount: number;
  pendingCount: number;
  plannedMinutes: number;
  /** Só `workDate <= hoje` — usado para o saldo, nunca para "Horas planeadas" (task, secção 12). */
  plannedMinutesToDate: number;
  actualMinutes: number;
  lateDays: Set<string>;
  lateMinutesTotal: number;
  absenceDays: Set<string>;
  hasSeverePending: boolean;
  /** Minutos reais por turno, para agrupar por jornada. */
  workedEntries: Array<{ workDate: string; minutes: number }>;
}

/**
 * "Resumo mensal" (Fase 2.1) — reaproveita a MESMA classificação de
 * `ListAttendanceIssuesUseCase` (`classifyScheduledShift`), nunca
 * recalcula tolerância/atraso uma 2ª vez. Agrega por colaborador em vez
 * de devolver 1 linha por ocorrência.
 */
export class GetMonthlyAttendanceSummaryUseCase implements GetMonthlyAttendanceSummaryPort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly shiftAttendanceRead: ShiftAttendanceReadPort,
    private readonly leaveRead: LeaveReadPort,
    private readonly attendanceRulesRepository: AttendanceRulesRepositoryPort,
    private readonly attendanceCorrectionRepository: AttendanceCorrectionRepositoryPort,
    private readonly monthlyClosureRepository: MonthlyClosureRepositoryPort,
  ) {}

  async execute(command: GetMonthlyAttendanceSummaryCommand): Promise<MonthlyAttendanceSummaryResultDTO> {
    // Período fechado com snapshot guardado → serve a foto do momento do
    // fecho, nunca recalcula ao vivo (task "Simplificar Assiduidade",
    // secção 18: "proteger os dados consolidados"). Sem snapshot (fechos
    // antigos, antes desta funcionalidade) cai no cálculo normal abaixo.
    const closure = await this.monthlyClosureRepository.findByPeriod(command.organizationId, command.year, command.month);
    if (closure?.isClosed && closure.snapshot) {
      return closure.snapshot as MonthlyAttendanceSummaryResultDTO;
    }

    const now = DateTime.now().setZone(REPORT_TIMEZONE);
    const { from, to } = monthRange(command.year, command.month);

    const [shifts, employees, leaves, ruleVersions, corrections] = await Promise.all([
      this.shiftAttendanceRead.findShiftsInRange(command.organizationId, {
        from,
        to,
        ...(command.locationId && { locationId: command.locationId }),
      }),
      this.employeeRepository.findMany(command.organizationId, { status: "all" }),
      this.leaveRead.findActiveInRange(command.organizationId, from, to),
      // Ver comentário equivalente em list-attendance-issues.use-case.ts — "Por
      // colaborador" não deve ficar indisponível só porque as tabelas novas
      // (Fase 2.1) ainda não foram migradas em todos os ambientes.
      this.attendanceRulesRepository.listVersions(command.organizationId).catch(() => []),
      this.attendanceCorrectionRepository.listInRange(command.organizationId, from, to).catch(() => []),
    ]);

    const employeeById = new Map(employees.map((e) => [e.id, { fullName: e.fullName, positionId: e.positionId }]));
    const latestCorrectionByRowKey = latestCorrectionByKey(corrections);

    const overlapGroups = new Map<string, typeof shifts>();
    for (const s of shifts) {
      const key = `${s.employeeId}:${s.workDate}`;
      const list = overlapGroups.get(key) ?? [];
      list.push(s);
      overlapGroups.set(key, list);
    }

    const today = now.toISODate()!;
    const byEmployee = new Map<string, Accumulator>();
    function accumulatorFor(employeeId: string): Accumulator {
      let acc = byEmployee.get(employeeId);
      if (!acc) {
        acc = {
          employeeId,
          plannedShiftsCount: 0,
          actualShiftsCount: 0,
          pendingCount: 0,
          plannedMinutes: 0,
          plannedMinutesToDate: 0,
          actualMinutes: 0,
          lateDays: new Set(),
          lateMinutesTotal: 0,
          absenceDays: new Set(),
          hasSeverePending: false,
          workedEntries: [],
        };
        byEmployee.set(employeeId, acc);
      }
      return acc;
    }

    for (const shift of shifts) {
      if (shift.attendanceStatus === "cancelled") continue;
      const acc = accumulatorFor(shift.employeeId);
      const periods = attributeActualToPeriods(shift);
      const shiftPlannedMinutes = sumPlannedMinutes(periods, shift.endsNextDay);
      acc.plannedShiftsCount += 1;
      acc.plannedMinutes += shiftPlannedMinutes;
      if (shift.workDate <= today) acc.plannedMinutesToDate += shiftPlannedMinutes;
      const shiftActualMinutes = sumActualMinutes(periods, shift.endsNextDay);
      acc.actualMinutes += shiftActualMinutes;
      if (shiftActualMinutes > 0) acc.workedEntries.push({ workDate: shift.workDate, minutes: shiftActualMinutes });
      if (shift.actualStartTime && shift.actualEndTime) acc.actualShiftsCount += 1;

      const key = `${shift.employeeId}:${shift.workDate}`;
      const group = overlapGroups.get(key)!;
      const hasOverlap = group.length > 1 && hasOverlappingOpenAttendance(group, now);
      const activeLeave = leaveCoversDate(leaves, shift.employeeId, shift.workDate);
      const classification = classifyScheduledShift(shift, now, { hasOverlap, activeLeave, ruleVersions });
      if (!classification) continue;

      const rowKey = correctionKey(shift.shiftId, shift.employeeId, shift.workDate);
      const latest = latestCorrectionByRowKey.get(rowKey);
      const isPending = !latest;
      if (isPending) {
        acc.pendingCount += 1;
        if (SEVERE_PENDING_KINDS.has(classification.occurrenceKind)) acc.hasSeverePending = true;
      }
      if (latest?.correctionType === "justify_no_impact") continue;

      if (classification.occurrenceKind === "late_entry") {
        acc.lateDays.add(shift.workDate);
        if (classification.diffMinutes != null && classification.diffMinutes > 0) acc.lateMinutesTotal += classification.diffMinutes;
      }
      if (classification.occurrenceKind === "absence") {
        acc.absenceDays.add(shift.workDate);
      }
    }

    const rulesFor = (workDate: string) => resolveEffectiveRules(ruleVersions, workDate);
    const rows: MonthlyAttendanceSummaryRowDTO[] = [...byEmployee.values()]
      .map((acc) => ({
        ...workdayColumns(acc.workedEntries, rulesFor),
        employeeId: acc.employeeId,
        employeeName: employeeById.get(acc.employeeId)?.fullName ?? acc.employeeId,
        positionId: employeeById.get(acc.employeeId)?.positionId ?? null,
        plannedShiftsCount: acc.plannedShiftsCount,
        actualShiftsCount: acc.actualShiftsCount,
        pendingCount: acc.pendingCount,
        plannedMinutes: acc.plannedMinutes,
        actualMinutes: acc.actualMinutes,
        lateDaysCount: acc.lateDays.size,
        lateMinutesTotal: acc.lateMinutesTotal,
        absenceDaysCount: acc.absenceDays.size,
        balanceMinutes: acc.actualMinutes - acc.plannedMinutesToDate,
        status: deriveEmployeeStatus(acc.pendingCount, acc.lateDays.size, acc.hasSeverePending),
      }))
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

    const actualShiftsCount = shifts.filter((s) => s.attendanceStatus !== "cancelled" && s.actualStartTime && s.actualEndTime).length;
    const plannedShiftsCount = shifts.filter((s) => s.attendanceStatus !== "cancelled").length;

    return {
      kpis: {
        employeeCount: rows.length,
        plannedShiftsCount,
        actualShiftsCount,
        lateDaysCount: rows.reduce((sum, r) => sum + r.lateDaysCount, 0),
        lateMinutesTotal: rows.reduce((sum, r) => sum + r.lateMinutesTotal, 0),
      },
      rows,
    };
  }
}
