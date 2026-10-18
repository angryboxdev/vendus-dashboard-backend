import type { AttendanceConfig } from "../../domain/ports/out/attendance.ports.js";

type Value = { key: string; value: unknown };

/**
 * Parâmetros efetivos (módulo settings, C6.1/C3.10/legal) → regras do motor.
 * Sem valor (null) = regra desligada; nunca se inventa um valor legal (ADR-0026).
 */
export function configFromSettings(values: Value[], timeZone: string): AttendanceConfig {
  const get = (k: string) => values.find((v) => v.key === k)?.value ?? null;
  const num = (k: string, fallback: number) => (typeof get(k) === "number" ? (get(k) as number) : fallback);
  const optNum = (k: string) => (typeof get(k) === "number" ? (get(k) as number) : null);
  const bool = (k: string) => get(k) === true;
  const time = (k: string) => (typeof get(k) === "string" && /^\d{2}:\d{2}$/.test(get(k) as string) ? (get(k) as string) : null);
  const list = (k: string) => (Array.isArray(get(k)) ? (get(k) as unknown[]).map(String) : []);
  return {
    rules: {
      timeZone,
      nightRule: get("time_tracking.night_shift.rule") === "continuity_margin" ? "continuity_margin" : "night_schedule_only",
      continuityMinutes: optNum("time_tracking.night_shift.continuity_minutes"),
      toleranceMinutes: num("time_tracking.tolerance.minutes", 0),
      roundingMinutes: num("time_tracking.rounding.minutes", 0),
      autoClose: bool("time_tracking.auto_close.enabled"),
      maxOpenHours: num("time_tracking.open_record.max_hours", 16),
      incidentHoursCount: bool("time_tracking.incidents.hours_count"),
      nightStart: time("legal.night.start"),
      nightEnd: time("legal.night.end"),
    },
    policy: {
      ipAllowlist: list("time_tracking.ip_allowlist"),
      blockBeforeStartMinutes: optNum("time_tracking.block_before_start_minutes"),
      requireCoordinates: bool("time_tracking.geofence.require_coordinates"),
      blockOutsideGeofence: bool("time_tracking.geofence.block_outside"),
    },
    refusal: { enabled: bool("time_tracking.correction.employee_can_refuse"), hours: num("time_tracking.correction.refusal_hours", 48) },
    portal: { usesNovoRh: bool("time_tracking.portal.uses_novo_rh") },
  };
}
