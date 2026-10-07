import type { WorkdayRulesValues } from "../entities/attendance-rules.js";
import { InvalidWorkdayRulesError } from "../errors.js";

/**
 * Jornada = tudo o que um colaborador trabalha num dia de escala, contado
 * pelo dia em que o turno COMEÇA (`workDate`). A limpeza depois da
 * meia-noite pertence à jornada do dia anterior — nunca conta como outro
 * dia nem outro turno. Vários turnos/períodos no mesmo dia somam-se.
 *
 * Equivalência (configurável em "Configurar regras"):
 * - até `standardShiftMinutes + closingToleranceMinutes` → 1 turno
 * - abaixo de `doubleShiftFromMinutes` → 1,5 turnos
 * - a partir de `doubleShiftFromMinutes` → 2 turnos (dupla)
 */
export type ShiftEquivalent = 0 | 1 | 1.5 | 2;

export function classifyWorkday(minutes: number, rules: WorkdayRulesValues): ShiftEquivalent {
  if (minutes <= 0) return 0;
  if (minutes <= rules.standardShiftMinutes + rules.closingToleranceMinutes) return 1;
  if (minutes < rules.doubleShiftFromMinutes) return 1.5;
  return 2;
}

export interface WorkdayTotals {
  /** Jornadas com tempo > 0. */
  days: number;
  /** Soma das equivalências (ex.: 20 jornadas normais + 2 duplas = 24). */
  shiftEquivalents: number;
  oneAndHalfDays: number;
  doubleDays: number;
}

/** Soma minutos por jornada (`workDate`) e classifica cada uma. */
export function summarizeWorkdays(entries: Array<{ workDate: string; minutes: number }>, rulesFor: (workDate: string) => WorkdayRulesValues): WorkdayTotals {
  const byDay = new Map<string, number>();
  for (const e of entries) byDay.set(e.workDate, (byDay.get(e.workDate) ?? 0) + e.minutes);
  const totals: WorkdayTotals = { days: 0, shiftEquivalents: 0, oneAndHalfDays: 0, doubleDays: 0 };
  for (const [workDate, minutes] of byDay) {
    const eq = classifyWorkday(minutes, rulesFor(workDate));
    if (eq === 0) continue;
    totals.days += 1;
    totals.shiftEquivalents += eq;
    if (eq === 1.5) totals.oneAndHalfDays += 1;
    if (eq === 2) totals.doubleDays += 1;
  }
  return totals;
}

/** Os limites têm de fazer sentido entre si: a dupla começa depois do turno normal + tolerância de fecho. */
export function assertWorkdayRules(rules: WorkdayRulesValues): void {
  if (rules.standardShiftMinutes <= 0) throw new InvalidWorkdayRulesError("A duração de um turno tem de ser maior que zero.");
  if (rules.doubleShiftFromMinutes <= rules.standardShiftMinutes + rules.closingToleranceMinutes) {
    throw new InvalidWorkdayRulesError("A dupla tem de começar depois da duração do turno somada à tolerância de fecho.");
  }
}
