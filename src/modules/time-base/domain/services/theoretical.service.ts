import { DateTime } from "luxon";
import type { HolidayDay } from "../entities/calendars.js";
import { plannedMinutes, type FixedDays, type IsoWeekday, type ScheduleKind, type ScheduleVersion } from "../entities/schedule.js";

/**
 * Tempo teórico diário (Eng. Reversa 3.4; TK-11). Regras:
 * - sem horário atribuído → 0, motivo `no_schedule` (aviso, não erro);
 * - feriado **confirmado** → 0 (feriado "a confirmar" não zera; fica aviso);
 * - modo `contract` (C3.10): horas semanais do contrato ÷ dias de trabalho do horário;
 * - meio dia: `halfDayMinutes` da versão, senão metade do dia.
 */
export type TheoreticalMode = "schedule" | "contract";

export interface TheoreticalInput {
  date: string;
  schedule: { kind: ScheduleKind; name: string; version: ScheduleVersion } | null;
  holiday: Pick<HolidayDay, "name" | "status"> | null;
  mode: TheoreticalMode;
  /** Horas semanais do contrato em vigor (modo contrato). */
  contractWeeklyMinutes: number | null;
  halfDay: boolean;
}

export type TheoreticalReason = "schedule" | "contract" | "rest_day" | "holiday" | "no_schedule" | "no_contract_hours";

export interface TheoreticalDay {
  date: string;
  minutes: number;
  reason: TheoreticalReason;
  scheduleName: string | null;
  holidayName: string | null;
  warnings: ("holiday_to_confirm" | "half_day")[];
  /** Horário fixo: primeira entrada e última saída planeadas (HH:MM) — atrasos e fecho automático. */
  plannedStart: string | null;
  plannedEnd: string | null;
  /** Faixas planeadas do dia (horário fixo), para descontar ausências por horas só no que coincide (CF-8). */
  plannedRanges: { start: string; end: string }[];
  /** Horário noturno: a jornada pode terminar no dia seguinte. */
  night: boolean;
}

export const isoWeekday = (date: string) => String(DateTime.fromISO(date, { zone: "utc" }).weekday) as IsoWeekday;

export function theoreticalDay(i: TheoreticalInput): TheoreticalDay {
  const ranges = i.schedule?.kind === "fixed" ? ((i.schedule.version.days as FixedDays)[isoWeekday(i.date)] ?? []) : [];
  const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
  const base = {
    date: i.date,
    scheduleName: i.schedule?.name ?? null,
    holidayName: i.holiday?.name ?? null,
    plannedStart: sorted[0]?.start ?? null,
    plannedEnd: sorted.at(-1)?.end ?? null,
    plannedRanges: sorted.map((r) => ({ start: r.start, end: r.end })),
    night: i.schedule?.version.night ?? false,
  };
  const warnings: TheoreticalDay["warnings"] = [];
  if (i.holiday?.status === "confirmed") return { ...base, minutes: 0, reason: "holiday", warnings };
  if (i.holiday?.status === "to_confirm") warnings.push("holiday_to_confirm");
  if (!i.schedule) return { ...base, minutes: 0, reason: "no_schedule", warnings };

  const wd = isoWeekday(i.date);
  const planned = plannedMinutes(i.schedule.kind, i.schedule.version, wd);
  if (planned === 0) return { ...base, minutes: 0, reason: "rest_day", warnings };

  let minutes = planned;
  let reason: TheoreticalReason = "schedule";
  if (i.mode === "contract") {
    const workingDays = (["1", "2", "3", "4", "5", "6", "7"] as IsoWeekday[]).filter((d) => plannedMinutes(i.schedule!.kind, i.schedule!.version, d) > 0).length;
    if (i.contractWeeklyMinutes === null || workingDays === 0) return { ...base, minutes: 0, reason: "no_contract_hours", warnings };
    minutes = Math.round(i.contractWeeklyMinutes / workingDays);
    reason = "contract";
  }
  if (i.halfDay) {
    warnings.push("half_day");
    minutes = i.schedule.version.halfDayMinutes ?? Math.round(minutes / 2);
  }
  return { ...base, minutes, reason, warnings };
}

/** Datas (AAAA-MM-DD) de `from` a `to`, inclusivas. */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = DateTime.fromISO(from, { zone: "utc" }); d.toISODate()! <= to; d = d.plus({ days: 1 })) out.push(d.toISODate()!);
  return out;
}
