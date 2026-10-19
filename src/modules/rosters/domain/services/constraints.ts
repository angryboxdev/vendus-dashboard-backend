import { DateTime } from "luxon";
import { segmentRanges, shiftMinutes, type ShiftState } from "../entities/roster.js";
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

/** Turno que conta, com a identidade quando já existe (para localizar conflitos). */
export type CountedShift = ShiftState & { id?: string; rosterId?: string; published?: boolean };

interface Interval {
  start: number;
  end: number;
  workDate: string;
  ref: CountedShift;
}

const dayIndex = (d: string) => Math.round(DateTime.fromISO(d, { zone: "utc" }).toMillis() / 86_400_000);

/**
 * Intervalos absolutos (minutos desde a época, hora de parede) de um turno:
 * noturnos acabam no dia seguinte e, num turno repartido, a faixa depois da
 * meia-noite é madrugada do dia seguinte (segmentRanges). Sem fuso nem hora
 * de verão (ADR-0030: hora de parede do centro).
 */
export function intervals(s: CountedShift): Interval[] {
  if (s.kind === "day_off") return [];
  const base = dayIndex(s.workDate) * 1440;
  return segmentRanges(s.segments).map((r) => ({ start: base + r.start, end: base + r.end, workDate: s.workDate, ref: s }));
}

/** «HH:MM» de um minuto absoluto. */
const hhmm = (abs: number) => {
  const m = ((abs % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Horário de um turno, ex.: "09:00–13:00 + 14:00–18:00". */
export const shiftHours = (s: Pick<ShiftState, "segments">) => s.segments.map((x) => `${x.start}–${x.end}`).join(" + ");

/**
 * Primeiro turno (do mesmo colaborador) com que o candidato se sobrepõe e o
 * troço sobreposto; null = compatível. Encostados (fim = início) não contam;
 * folgas nunca se sobrepõem.
 */
export function findOverlap<T extends CountedShift>(candidate: CountedShift, others: T[]): { other: T; from: string; to: string } | null {
  const mine = intervals(candidate);
  if (!mine.length) return null;
  for (const o of others) {
    if (o.employeeId !== candidate.employeeId) continue;
    for (const oi of intervals(o)) {
      for (const m of mine) {
        if (m.start < oi.end && oi.start < m.end) return { other: o, from: hhmm(Math.max(m.start, oi.start)), to: hhmm(Math.min(m.end, oi.end)) };
      }
    }
  }
  return null;
}

/** O turno sobrepõe-se a algum dos outros (do mesmo colaborador)? */
export function overlaps(candidate: ShiftState, others: ShiftState[]): boolean {
  return findOverlap(candidate, others) !== null;
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
export function evaluate(shifts: CountedShift[], rulesFor: Rules | ((employeeId: string) => Rules), absences: Map<string, Set<string>>, focus: Set<string> = new Set()): Violation[] {
  const out: Violation[] = [];
  const inFocus = (employeeId: string, date: string) => focus.size === 0 || focus.has(`${employeeId}|${date}`);
  const push = (v: Violation) => {
    if (inFocus(v.employeeId, v.workDate) && !out.some((x) => x.rule === v.rule && x.employeeId === v.employeeId && x.workDate === v.workDate)) out.push(v);
  };
  const byEmployee = new Map<string, CountedShift[]>();
  for (const s of shifts) byEmployee.set(s.employeeId, [...(byEmployee.get(s.employeeId) ?? []), s]);

  for (const [employeeId, list] of byEmployee) {
    // Regras de cada colaborador (cascata de parâmetros por pessoa).
    const rules = typeof rulesFor === "function" ? rulesFor(employeeId) : rulesFor;
    const ivs = list.flatMap(intervals).sort((a, b) => a.start - b.start || a.end - b.end);
    // Compara com o intervalo anterior que acaba mais tarde (não só com o vizinho):
    // 08–20 já tapa 11–12 mesmo havendo 09–10 pelo meio.
    let last: Interval | null = null;
    for (const cur of ivs) {
      const prev = last;
      if (!prev || cur.end > prev.end) last = cur;
      if (!prev) continue;
      if (cur.start < prev.end && cur.ref !== prev.ref) {
        const other = prev.ref;
        push({
          rule: "overlap",
          severity: "block",
          employeeId,
          workDate: cur.workDate,
          message: `Turnos sobrepostos em ${cur.workDate} (${hhmm(cur.start)}–${hhmm(Math.min(cur.end, prev.end))}).`,
          shiftId: cur.ref.id ?? null,
          rosterId: cur.ref.rosterId ?? null,
          conflict: { shiftId: other.id ?? null, rosterId: other.rosterId ?? null, rosterName: null, workDate: other.workDate, hours: shiftHours(other), published: other.published ?? false },
          overlap: `${hhmm(cur.start)}–${hhmm(Math.min(cur.end, prev.end))}`,
        });
        continue;
      }
      if (cur.ref === prev.ref) continue;
      // Descanso entre turnos de dias diferentes (pausas dentro do mesmo dia não contam).
      if (rules.minRestMinutes !== null && cur.workDate !== prev.workDate && cur.start - prev.end < rules.minRestMinutes) {
        push({ rule: "min_rest", severity: rules.restSeverity, employeeId, workDate: cur.workDate, shiftId: cur.ref.id ?? null, rosterId: cur.ref.rosterId ?? null, message: `Só ${fmtH(cur.start - prev.end)} de descanso antes do turno de ${cur.workDate} (mínimo ${fmtH(rules.minRestMinutes)}).` });
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
        push({ rule: "absence", severity: rules.absenceSeverity, employeeId, workDate: s.workDate, shiftId: s.id ?? null, rosterId: s.rosterId ?? null, message: `Turno num dia com ausência aprovada (${s.workDate}).` });
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
