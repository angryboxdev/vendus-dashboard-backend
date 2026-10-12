import { DateTime } from "luxon";

/**
 * Dia de trabalho no fuso do centro (task §5, TK-12). Instantes guardados em
 * UTC; o "dia" é sempre o do fuso do centro, e um dia de mudança de hora
 * tem 23 ou 25 horas (nunca se assume 24).
 */

/** Data local (AAAA-MM-DD) de um instante UTC no fuso do centro. */
export function localDateOf(instantIso: string, timeZone: string): string {
  return DateTime.fromISO(instantIso, { zone: "utc" }).setZone(timeZone).toISODate()!;
}

/** Início e fim (exclusivo) de um dia local, em UTC, e a duração real em minutos. */
export function dayBoundsUtc(date: string, timeZone: string): { startUtc: string; endUtc: string; minutes: number } {
  const start = DateTime.fromISO(date, { zone: timeZone }).startOf("day");
  const end = start.plus({ days: 1 });
  return { startUtc: start.toUTC().toISO()!, endUtc: end.toUTC().toISO()!, minutes: Math.round(end.diff(start, "minutes").minutes) };
}

/** Instante UTC de uma hora local "HH:MM" numa data, no fuso do centro (para turnos). */
export function localTimeToUtc(date: string, hhmm: string, timeZone: string): string {
  return DateTime.fromISO(`${date}T${hhmm}`, { zone: timeZone }).toUTC().toISO()!;
}
