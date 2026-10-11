import { TimeValidationError } from "../errors.js";

/**
 * Horários (Configurações C4.1; Eng. Reversa 13.1 `work_schedule`,
 * `work_schedule_version`). Versões por período de vigência, sem sobreposição.
 */

export type ScheduleKind = "fixed" | "flexible";
export type IsoWeekday = "1" | "2" | "3" | "4" | "5" | "6" | "7";
export const WEEKDAYS: IsoWeekday[] = ["1", "2", "3", "4", "5", "6", "7"];

export interface TimeRange {
  start: string;
  end: string;
}

/** Fixo: faixas por dia. Flexível: minutos por dia. Dias ausentes = descanso. */
export type FixedDays = Partial<Record<IsoWeekday, TimeRange[]>>;
export type FlexibleDays = Partial<Record<IsoWeekday, number>>;

export interface WorkSchedule {
  id: string;
  name: string;
  kind: ScheduleKind;
  archived: boolean;
}

export interface ScheduleVersion {
  id: string;
  scheduleId: string;
  validFrom: string;
  validTo: string | null;
  days: FixedDays | FlexibleDays;
  /** Jornada noturna: uma faixa pode terminar no dia seguinte. */
  night: boolean;
  /** Definição explícita de meio dia (minutos); null = metade do dia. */
  halfDayMinutes: number | null;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Duração de uma faixa; termina no dia seguinte quando o fim é ≤ início (só em horário noturno). */
export function rangeMinutes(r: TimeRange, night: boolean): number {
  const a = toMinutes(r.start);
  const b = toMinutes(r.end);
  if (b > a) return b - a;
  if (!night) throw new TimeValidationError(`Faixa ${r.start}–${r.end}: o fim tem de ser depois do início (ou marque horário noturno).`, "days");
  return 1440 - a + b;
}

export function validateVersion(kind: ScheduleKind, v: Omit<ScheduleVersion, "id" | "scheduleId">): void {
  if (!DATE.test(v.validFrom) || (v.validTo !== null && (!DATE.test(v.validTo) || v.validTo < v.validFrom))) {
    throw new TimeValidationError("Vigência inválida.", "validFrom");
  }
  if (v.halfDayMinutes !== null && !(Number.isInteger(v.halfDayMinutes) && v.halfDayMinutes >= 0 && v.halfDayMinutes <= 1440)) {
    throw new TimeValidationError("Meio dia em minutos (0–1440).", "halfDayMinutes");
  }
  const keys = Object.keys(v.days);
  if (keys.some((k) => !WEEKDAYS.includes(k as IsoWeekday))) throw new TimeValidationError("Dia da semana inválido.", "days");
  if (kind === "flexible") {
    for (const [d, m] of Object.entries(v.days)) {
      if (!(typeof m === "number" && Number.isInteger(m) && m >= 0 && m <= 1440)) throw new TimeValidationError(`Dia ${d}: minutos entre 0 e 1440.`, "days");
    }
    return;
  }
  for (const [d, ranges] of Object.entries(v.days)) {
    if (!Array.isArray(ranges)) throw new TimeValidationError(`Dia ${d}: faixas inválidas.`, "days");
    const spans: [number, number][] = [];
    for (const r of ranges as TimeRange[]) {
      if (!TIME.test(r?.start ?? "") || !TIME.test(r?.end ?? "")) throw new TimeValidationError(`Dia ${d}: hora inválida (HH:MM).`, "days");
      const start = toMinutes(r.start);
      spans.push([start, start + rangeMinutes(r, v.night)]);
    }
    spans.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i++) {
      if (spans[i]![0] < spans[i - 1]![1]) throw new TimeValidationError(`Dia ${d}: faixas sobrepostas.`, "days");
    }
  }
}

/** Versões do mesmo horário não se sobrepõem. */
export function versionOverlaps(existing: ScheduleVersion[], next: { validFrom: string; validTo: string | null }): ScheduleVersion | null {
  return existing.find((v) => (v.validTo === null || next.validFrom <= v.validTo) && (next.validTo === null || v.validFrom <= next.validTo)) ?? null;
}

export const versionOn = (versions: ScheduleVersion[], date: string) =>
  versions.find((v) => v.validFrom <= date && (v.validTo === null || date <= v.validTo)) ?? null;

/** Minutos planeados num dia da semana (0 = descanso). */
export function plannedMinutes(kind: ScheduleKind, v: ScheduleVersion, weekday: IsoWeekday): number {
  if (kind === "flexible") return (v.days as FlexibleDays)[weekday] ?? 0;
  return ((v.days as FixedDays)[weekday] ?? []).reduce((s, r) => s + rangeMinutes(r, v.night), 0);
}
