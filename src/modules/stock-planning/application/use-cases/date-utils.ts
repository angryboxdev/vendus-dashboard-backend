import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../../../../utils/lisbonDayInstants.js";

/** "Ontem" (YYYY-MM-DD) no calendário de Lisboa — mesmo fuso que o resto do reporting Vendus. */
export function yesterdayISO(): string {
  const day = DateTime.now().setZone(REPORT_TIMEZONE).minus({ days: 1 }).toISODate();
  if (!day) throw new Error("Não foi possível calcular 'ontem' em Lisboa");
  return day;
}

export function addDaysISO(dateISO: string, days: number): string {
  const result = DateTime.fromISO(dateISO, { zone: "utc" }).plus({ days }).toISODate();
  if (!result) throw new Error(`Data inválida: ${dateISO}`);
  return result;
}

export function diffDaysISO(laterISO: string, earlierISO: string): number {
  const later = DateTime.fromISO(laterISO, { zone: "utc" });
  const earlier = DateTime.fromISO(earlierISO, { zone: "utc" });
  return Math.round(later.diff(earlier, "days").days);
}
