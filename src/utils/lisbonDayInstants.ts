import { DateTime } from "luxon";

/** Fuso usado para interpretar `since` / `until` (YYYY-MM-DD) em relatórios de stock. */
export const REPORT_TIMEZONE = "Europe/Lisbon";

/**
 * Instante UTC (ISO 8601) correspondente à meia-noite do dia civil `dateYmd` em Lisboa.
 */
export function lisbonDayStartUtcIso(dateYmd: string): string {
  const dt = DateTime.fromISO(dateYmd, {
    zone: REPORT_TIMEZONE,
  }).startOf("day");
  if (!dt.isValid) {
    throw new Error(`Data inválida: ${dateYmd}`);
  }
  const iso = dt.toUTC().toISO({ suppressMilliseconds: false });
  if (!iso) {
    throw new Error(`Não foi possível converter início do dia: ${dateYmd}`);
  }
  return iso;
}

/**
 * Instante UTC (ISO 8601) correspondente ao fim do dia civil `dateYmd` em Lisboa (23:59:59.999).
 */
export function lisbonDayEndUtcIso(dateYmd: string): string {
  const dt = DateTime.fromISO(dateYmd, {
    zone: REPORT_TIMEZONE,
  }).endOf("day");
  if (!dt.isValid) {
    throw new Error(`Data inválida: ${dateYmd}`);
  }
  const iso = dt.toUTC().toISO({ suppressMilliseconds: false });
  if (!iso) {
    throw new Error(`Não foi possível converter fim do dia: ${dateYmd}`);
  }
  return iso;
}
