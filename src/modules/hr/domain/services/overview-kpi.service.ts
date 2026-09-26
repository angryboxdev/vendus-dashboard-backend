import type { DateTime } from "luxon";
import type { ShiftOccurrence } from "../ports/out/shift-attendance-read.port.js";
import {
  computeShiftExceptions,
  computeShiftState,
  hasOverlappingOpenAttendance,
} from "./overview-shift-state.service.js";

export interface TodayOperationKpis {
  /** Pessoas únicas com ≥1 turno válido hoje (2 turnos da mesma pessoa contam 1). */
  scheduledCount: number;
  /** Pessoas únicas com pelo menos um turno em estado PRESENTE agora. */
  presentCount: number;
  /** Pessoas únicas com uma ocorrência de atraso hoje (pode coexistir com "presente"). */
  lateCount: number;
  /** Pessoas únicas com todos os turnos de hoje AUSENTE_OPERACIONAL e sem ausência aprovada a cobrir o dia. */
  absentCount: number;
}

function groupByEmployee(shifts: ShiftOccurrence[]): Map<string, ShiftOccurrence[]> {
  const map = new Map<string, ShiftOccurrence[]>();
  for (const shift of shifts) {
    const list = map.get(shift.employeeId) ?? [];
    list.push(shift);
    map.set(shift.employeeId, list);
  }
  return map;
}

/**
 * Agrega os turnos de HOJE (já filtrados para um único dia civil) em
 * contagens de pessoas únicas — nunca de turnos (RH-01 secção 5: "2 turnos
 * da mesma pessoa continuam a contar 1").
 */
export function computeTodayOperationKpis(
  shiftsToday: ShiftOccurrence[],
  employeesWithActiveLeaveToday: ReadonlySet<string>,
  now: DateTime,
): TodayOperationKpis {
  const active = shiftsToday.filter((s) => s.attendanceStatus !== "cancelled");
  const byEmployee = groupByEmployee(active);

  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;

  for (const [employeeId, shifts] of byEmployee) {
    const states = shifts.map((s) => computeShiftState(s, now));
    if (states.includes("PRESENTE")) presentCount++;

    const hasLateOccurrence =
      states.includes("ATRASADO_AGUARDANDO_ENTRADA") ||
      shifts.some((s) => computeShiftExceptions(s, now).includes("CHEGADA_ATRASADA"));
    if (hasLateOccurrence) lateCount++;

    const allAbsent = states.every((s) => s === "AUSENTE_OPERACIONAL");
    if (allAbsent && !employeesWithActiveLeaveToday.has(employeeId)) absentCount++;
  }

  return {
    scheduledCount: byEmployee.size,
    presentCount,
    lateCount,
    absentCount,
  };
}

/** Colaboradores com ≥2 turnos simultaneamente "abertos" hoje — conflito a rever manualmente. */
export function computeConflictEmployeeIds(shiftsToday: ShiftOccurrence[], now: DateTime): string[] {
  const active = shiftsToday.filter((s) => s.attendanceStatus !== "cancelled");
  const byEmployee = groupByEmployee(active);
  const conflicted: string[] = [];
  for (const [employeeId, shifts] of byEmployee) {
    if (hasOverlappingOpenAttendance(shifts, now)) conflicted.push(employeeId);
  }
  return conflicted;
}
