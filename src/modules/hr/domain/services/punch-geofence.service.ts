/**
 * Geolocalização na picagem pelo Portal do Colaborador (ticket 05,
 * decisões P8–P10). Puro: o telemóvel só envia latitude/longitude/precisão
 * (ou o motivo de não as ter); a distância e o resultado são sempre
 * calculados aqui — nunca se confia num "estou dentro" vindo do cliente.
 *
 * O GPS do browser pode ser manipulado: o resultado é evidência e alerta,
 * não antifraude infalível.
 */

export type GeofencePolicy = "off" | "warn" | "block";
export type GeofenceStatus = "inside" | "outside" | "unverified" | "not_required";
export type UnverifiedReason = "low_accuracy" | "ambiguous" | "permission_denied" | "unavailable" | "timeout" | "location_not_configured";

export interface LocationFence {
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  policy: GeofencePolicy;
}

/** O que o telemóvel conseguiu obter no momento do toque. */
export type ClientLocation =
  | { kind: "reading"; latitude: number; longitude: number; accuracyM: number }
  | { kind: "error"; reason: "permission_denied" | "unavailable" | "timeout" };

/** Acima desta precisão a leitura não serve para decidir "dentro/fora" — fica "não verificada", nunca "fora". */
export const MAX_USEFUL_ACCURACY_M = 100;

export interface GeofenceResult {
  status: GeofenceStatus;
  reason: UnverifiedReason | null;
  /** Distância ao Local (m), quando há leitura e o Local tem coordenadas. */
  distanceM: number | null;
}

const EARTH_RADIUS_M = 6_371_000;

export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * - Política `off`: `not_required` (a localização nem é pedida nem guardada).
 * - Sem leitura (negada/indisponível/timeout) ou Local sem coordenadas: `unverified`.
 * - Precisão pior do que `MAX_USEFUL_ACCURACY_M`: `unverified` (`low_accuracy`).
 * - Distância ≤ raio: `inside`.
 * - Fora do raio mesmo descontando a margem de erro (distância − precisão > raio): `outside`.
 * - Entre os dois (a margem de erro cruza a fronteira): `unverified` (`ambiguous`).
 */
export function classifyGeofence(fence: LocationFence, client: ClientLocation | null): GeofenceResult {
  if (fence.policy === "off") return { status: "not_required", reason: null, distanceM: null };
  if (fence.latitude === null || fence.longitude === null) {
    return { status: "unverified", reason: "location_not_configured", distanceM: null };
  }
  if (!client) return { status: "unverified", reason: "unavailable", distanceM: null };
  if (client.kind === "error") return { status: "unverified", reason: client.reason, distanceM: null };

  const distanceM = Math.round(distanceMeters(client, { latitude: fence.latitude, longitude: fence.longitude }) * 10) / 10;
  if (!(client.accuracyM >= 0) || client.accuracyM > MAX_USEFUL_ACCURACY_M) return { status: "unverified", reason: "low_accuracy", distanceM };
  if (distanceM <= fence.radiusM) return { status: "inside", reason: null, distanceM };
  if (distanceM - client.accuracyM > fence.radiusM) return { status: "outside", reason: null, distanceM };
  return { status: "unverified", reason: "ambiguous", distanceM };
}

export interface GeofenceDecision {
  allowed: boolean;
  /** Gera alerta para o gestor (picagem aceite mas a rever). */
  alert: boolean;
}

/**
 * - `off`: aceita sempre, sem alerta.
 * - `warn`: aceita sempre; alerta se `outside` ou `unverified`.
 * - `block`: recusa `outside`; aceita `unverified` com alerta (decisão P10 —
 *   ninguém fica impedido de picar por mau sinal).
 */
export function decideGeofence(policy: GeofencePolicy, result: GeofenceResult): GeofenceDecision {
  if (policy === "off" || result.status === "inside" || result.status === "not_required") return { allowed: true, alert: false };
  if (policy === "block" && result.status === "outside") return { allowed: false, alert: false };
  return { allowed: true, alert: true };
}
