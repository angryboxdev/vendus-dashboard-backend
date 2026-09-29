import type { WorkShift, WorkShiftSegment } from "../entities/work-shift.js";
import type { Weekday } from "../entities/base-schedule-template.js";

// ── Datas puras (sem infra) — mesma convenção 0=Segunda..6=Domingo já usada
// pela escala base (RH-03). Duplicadas aqui deliberadamente: um serviço de
// domínio não importa de application/use-cases (ver schedule-shared.ts). ──

function addDays(dateYmd: string, days: number): string {
  const d = new Date(dateYmd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(dateYmd: string): Weekday {
  const d = new Date(dateYmd + "T00:00:00Z");
  return ((d.getUTCDay() + 6) % 7) as Weekday;
}

function daysBetweenInclusive(fromYmd: string, toYmd: string): number {
  const a = new Date(fromYmd + "T00:00:00Z").getTime();
  const b = new Date(toYmd + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// ── Especificação do padrão semanal (task "Novo Turno Padrão Semanal") ──────

export interface WeeklyDayRule {
  weekdays: Weekday[];
  /** 1 período = turno direto; 2 = turno repartido (V1, secção 3). */
  segments: WorkShiftSegment[];
  /** Turno noturno — nunca combinado com 2 períodos (mesma regra de `WorkShift`). */
  endsNextDay?: boolean;
}

export type RepeatMode =
  | { kind: "none" }
  | { kind: "weeks"; weeks: number }
  | { kind: "until_date"; untilDate: string };

export interface RecurrenceSpec {
  /** Primeira data em que o padrão pode aplicar-se — não precisa de ser segunda-feira. */
  startDate: string;
  rules: WeeklyDayRule[];
  repeat: RepeatMode;
}

export interface PlannedOccurrence {
  workDate: string;
  weekday: Weekday;
  segments: WorkShiftSegment[];
  endsNextDay: boolean;
}

/**
 * Motor único de expansão do padrão semanal — usado pelo preview e pela
 * criação real, sem duplicar regras (task, secção 8: "o preview deve usar
 * exatamente as mesmas regras do backend que serão usadas ao gravar").
 * Varre dia a dia (não assume mês de 4 semanas nem ancora a segunda-feira)
 * — "semana 5"/mudança de mês funcionam sem lógica especial.
 */
export function expandRecurrence(spec: RecurrenceSpec): PlannedOccurrence[] {
  const totalDays =
    spec.repeat.kind === "none"
      ? 7
      : spec.repeat.kind === "weeks"
        ? spec.repeat.weeks * 7
        : Math.max(1, daysBetweenInclusive(spec.startDate, spec.repeat.untilDate));

  const occurrences: PlannedOccurrence[] = [];
  for (let i = 0; i < totalDays; i++) {
    const workDate = addDays(spec.startDate, i);
    const weekday = weekdayOf(workDate);
    const rule = spec.rules.find((r) => r.weekdays.includes(weekday));
    if (!rule) continue;
    occurrences.push({ workDate, weekday, segments: rule.segments, endsNextDay: rule.endsNextDay ?? false });
  }
  return occurrences;
}

/** Intervalos [início,fim] em minutos absolutos, ancorados às 00:00 de `workDate` (dia 0) — permite comparar turnos de dias diferentes, incluindo noturnos. */
function absoluteRanges(segments: WorkShiftSegment[], endsNextDay: boolean, dayOffset: number): Array<[number, number]> {
  const base = dayOffset * 24 * 60;
  const ranges: Array<[number, number]> = [];
  const first = segments[0]!;
  const firstEnd = toMinutes(first.endTime) + (endsNextDay ? 24 * 60 : 0);
  ranges.push([base + toMinutes(first.startTime), base + firstEnd]);
  if (segments[1]) ranges.push([base + toMinutes(segments[1].startTime), base + toMinutes(segments[1].endTime)]);
  return ranges;
}

function rangesOverlap(a: Array<[number, number]>, b: Array<[number, number]>): boolean {
  return a.some(([aStart, aEnd]) => b.some(([bStart, bEnd]) => aStart < bEnd && bStart < aEnd));
}

/** Um turno já existente sobrepõe-se a esta ocorrência planeada? Considera turnos no próprio dia e nos dias adjacentes (para cobrir turnos noturnos de qualquer um dos lados). */
export function occurrenceOverlapsShift(occurrence: PlannedOccurrence, shift: Pick<WorkShift, "workDate" | "segments" | "endsNextDay">): boolean {
  const dayOffset = daysBetweenInclusive(occurrence.workDate, shift.workDate) - 1;
  if (Math.abs(dayOffset) > 1) return false;
  const occRanges = absoluteRanges(occurrence.segments, occurrence.endsNextDay, 0);
  const shiftRanges = absoluteRanges(shift.segments, shift.endsNextDay, dayOffset);
  return rangesOverlap(occRanges, shiftRanges);
}

export interface PartitionedOccurrences {
  /** Sem conflito nem ausência/feriado — prontas a criar. */
  toCreate: PlannedOccurrence[];
  /** Sobrepõem um turno já existente do colaborador — bloqueiam, a não ser que o utilizador force. */
  conflicts: PlannedOccurrence[];
  /** Dia de férias/ausência ou feriado — nunca cria turno, mesmo com `force` (mesma regra já usada na escala base/rotações). */
  skipped: Array<PlannedOccurrence & { reason: "leave" | "holiday" }>;
}

export function partitionOccurrences(params: {
  occurrences: readonly PlannedOccurrence[];
  existingShifts: readonly WorkShift[];
  employeeOnLeaveDates: ReadonlySet<string>;
  holidayDates: ReadonlySet<string>;
}): PartitionedOccurrences {
  const { occurrences, existingShifts, employeeOnLeaveDates, holidayDates } = params;
  const toCreate: PlannedOccurrence[] = [];
  const conflicts: PlannedOccurrence[] = [];
  const skipped: PartitionedOccurrences["skipped"] = [];

  for (const occ of occurrences) {
    if (employeeOnLeaveDates.has(occ.workDate)) {
      skipped.push({ ...occ, reason: "leave" });
      continue;
    }
    if (holidayDates.has(occ.workDate)) {
      skipped.push({ ...occ, reason: "holiday" });
      continue;
    }
    const overlaps = existingShifts.some((s) => occurrenceOverlapsShift(occ, s));
    if (overlaps) {
      conflicts.push(occ);
      continue;
    }
    toCreate.push(occ);
  }

  return { toCreate, conflicts, skipped };
}
