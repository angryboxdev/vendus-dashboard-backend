import { DateTime } from "luxon";

/**
 * Regras na hora de picar (C6.1 Bloqueios; RE-12, RE-13, CF-11). Devolve o
 * motivo da recusa ou null. Geolocalização só quando ligada (D7 — DPIA).
 */

export interface PunchPolicy {
  ipAllowlist: string[];
  /** Minutos antes da hora de entrada a partir dos quais se aceita; null = sem bloqueio. */
  blockBeforeStartMinutes: number | null;
  requireCoordinates: boolean;
  blockOutsideGeofence: boolean;
}

export interface PunchContext {
  nowUtc: string;
  timeZone: string;
  ip: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Entrada planeada de hoje (HH:MM) — só quando o colaborador está a entrar. */
  plannedStart: string | null;
  isEntry: boolean;
  location: { latitude: number | null; longitude: number | null; radiusMeters: number } | null;
}

export type PunchRefusal = "ip_not_allowed" | "before_start" | "coordinates_required" | "outside_geofence";

/** Distância em metros (haversine). */
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function checkPunch(policy: PunchPolicy, ctx: PunchContext): PunchRefusal | null {
  if (policy.ipAllowlist.length > 0 && (!ctx.ip || !policy.ipAllowlist.includes(ctx.ip))) return "ip_not_allowed";
  if (ctx.isEntry && policy.blockBeforeStartMinutes !== null && ctx.plannedStart) {
    const today = DateTime.fromISO(ctx.nowUtc, { zone: "utc" }).setZone(ctx.timeZone).toISODate()!;
    const earliest = DateTime.fromISO(`${today}T${ctx.plannedStart}`, { zone: ctx.timeZone }).minus({ minutes: policy.blockBeforeStartMinutes }).toUTC().toISO()!;
    if (ctx.nowUtc < earliest) return "before_start";
  }
  if (policy.requireCoordinates && (ctx.latitude === null || ctx.longitude === null)) return "coordinates_required";
  // Fora da zona só se bloqueia a entrada (decisão do utilizador, 2026-10-23): saída e pausas fora passam, com a localização guardada.
  if (policy.blockOutsideGeofence && ctx.isEntry && ctx.location?.latitude != null && ctx.location.longitude != null) {
    if (ctx.latitude === null || ctx.longitude === null) return "coordinates_required";
    const d = distanceMeters({ latitude: ctx.latitude, longitude: ctx.longitude }, { latitude: ctx.location.latitude, longitude: ctx.location.longitude });
    if (d > ctx.location.radiusMeters) return "outside_geofence";
  }
  return null;
}

export const REFUSAL_MESSAGE: Record<PunchRefusal, string> = {
  ip_not_allowed: "Não é possível picar a partir desta rede.",
  before_start: "Ainda é cedo para picar a entrada. Se precisar, peça uma correção.",
  coordinates_required: "É preciso permitir a localização para picar.",
  outside_geofence: "Está fora da zona do centro. Pode enviar um pedido de correção.",
};
