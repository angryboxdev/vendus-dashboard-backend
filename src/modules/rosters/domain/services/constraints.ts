import { DateTime } from "luxon";
import { shiftMinutes, type ShiftState } from "../entities/roster.js";
import type { Severity, Violation } from "../entities/violation.js";

export type { RuleKey, Severity, Violation } from "../entities/violation.js";

/**
 * Motor de restrições das escalas (4.1 REIMPLEMENTAÇÃO; RE-16, RE-18).
 * Puro: recebe os turnos que contam para cada colaborador (publicados + o
 * rascunho a publicar) e as regras; devolve violações com severidade.
 * Sem valor legal (D6) → a regra não se aplica. Sobreposição bloqueia sempre.
 */

export interface Rules {
  minRestMinutes: number | null;
  maxDailyMinutes: number | null;
  maxWeeklyMinutes: number | null;
  maxAnnualHours: number | null;
  restSeverity: Severity;
  limitsSeverity: Severity;
  absenceSeverity: Severity;
}

interface Interval {
  start: number;
  end: number;
  workDate: string;
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const dayIndex = (d: string) => Math.round(DateTime.fromISO(d, { zone: "utc" }).toMillis() / 86_400_000);

/** Intervalos absolutos (minutos desde a época, hora de parede) de um turno. */
export function intervals(s: ShiftState): Interval[] {
  if (s.kind === "day_off") return [];
  const base = dayIndex(s.workDate) * 1440;
  return s.segments.map((seg) => {
    const a = toMin(seg.start);
    let b = toMin(seg.end);
    if (b <= a) b += 1440;
    return { start: base + a, end: base + b, workDate: s.workDate };
  });
}

const fmtH = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
const isoWeek = (d: string) => {
  const dt = DateTime.fromISO(d, { zone: "utc" });
  return `${dt.weekYear}-W${dt.weekNumber}`;
};

/**
 * @param shifts turnos que contam, por colaborador (já com o rascunho aplicado)
 * @param focus só reporta violações em dias deste conjunto (as alterações); vazio = todos
 * @param absences dias com ausência aprovada, por colaborador
 */
export function evaluate(shifts: ShiftState[], rules: Rules, absences: Map<string, Set<string>>, focus: Set<string> = new Set()): Violation[] {
  const out: Violation[] = [];
  const inFocus = (employeeId: string, date: string) => focus.size === 0 || focus.has(`${employeeId}|${date}`);
  const push = (v: Violation) => {
    if (inFocus(v.employeeId, v.workDate) && !out.some((x) => x.rule === v.rule && x.employeeId === v.employeeId && x.workDate === v.workDate)) out.push(v);
  };
  const byEmployee = new Map<string, ShiftState[]>();
  for (const s of shifts) byEmployee.set(s.employeeId, [...(byEmployee.get(s.employeeId) ?? []), s]);

  for (const [employeeId, list] of byEmployee) {
    const ivs = list.flatMap(intervals).sort((a, b) => a.start - b.start);
    for (let i = 1; i < ivs.length; i++) {
      const prev = ivs[i - 1]!;
      const cur = ivs[i]!;
      if (cur.start < prev.end) {
        push({ rule: "overlap", severity: "block", employeeId, workDate: cur.workDate, message: `Turnos sobrepostos em ${cur.workDate}.` });
        continue;
      }
      // Descanso entre turnos de dias diferentes (pausas dentro do mesmo dia não contam).
      if (rules.minRestMinutes !== null && cur.workDate !== prev.workDate && cur.start - prev.end < rules.minRestMinutes) {
        push({ rule: "min_rest", severity: rules.restSeverity, employeeId, workDate: cur.workDate, message: `Só ${fmtH(cur.start - prev.end)} de descanso antes do turno de ${cur.workDate} (mínimo ${fmtH(rules.minRestMinutes)}).` });
      }
    }
    const perDay = new Map<string, number>();
    const perWeek = new Map<string, { minutes: number; last: string }>();
    const perYear = new Map<string, { minutes: number; last: string }>();
    for (const s of list) {
      const m = shiftMinutes(s);
      perDay.set(s.workDate, (perDay.get(s.workDate) ?? 0) + m);
      const w = perWeek.get(isoWeek(s.workDate)) ?? { minutes: 0, last: s.workDate };
      perWeek.set(isoWeek(s.workDate), { minutes: w.minutes + m, last: s.workDate > w.last ? s.workDate : w.last });
      const y = perYear.get(s.workDate.slice(0, 4)) ?? { minutes: 0, last: s.workDate };
      perYear.set(s.workDate.slice(0, 4), { minutes: y.minutes + m, last: s.workDate > y.last ? s.workDate : y.last });
      if (s.kind === "shift" && absences.get(employeeId)?.has(s.workDate)) {
        push({ rule: "absence", severity: rules.absenceSeverity, employeeId, workDate: s.workDate, message: `Turno num dia com ausência aprovada (${s.workDate}).` });
      }
    }
    if (rules.maxDailyMinutes !== null) {
      for (const [d, m] of perDay) if (m > rules.maxDailyMinutes) push({ rule: "max_daily", severity: rules.limitsSeverity, employeeId, workDate: d, message: `${fmtH(m)} em ${d} (máximo diário ${fmtH(rules.maxDailyMinutes)}).` });
    }
    if (rules.maxWeeklyMinutes !== null) {
      for (const [, w] of perWeek) {
        if (w.minutes <= rules.maxWeeklyMinutes) continue;
        // Reporta em todos os dias da semana em foco (qualquer alteração dessa semana o provoca).
        for (const s of list) if (isoWeek(s.workDate) === isoWeek(w.last)) push({ rule: "max_weekly", severity: rules.limitsSeverity, employeeId, workDate: s.workDate, message: `${fmtH(w.minutes)} na semana (máximo ${fmtH(rules.maxWeeklyMinutes)}).` });
      }
    }
    if (rules.maxAnnualHours !== null) {
      for (const [year, y] of perYear) {
        if (y.minutes <= rules.maxAnnualHours * 60) continue;
        for (const s of list) if (s.workDate.startsWith(year)) push({ rule: "max_annual", severity: rules.limitsSeverity, employeeId, workDate: s.workDate, message: `${fmtH(y.minutes)} em ${year} (máximo anual ${rules.maxAnnualHours}h).` });
      }
    }
  }
  return out;
}
