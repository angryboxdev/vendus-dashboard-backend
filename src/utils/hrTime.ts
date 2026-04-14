/** Converte "HH:mm" ou "HH:mm:ss" para "HH:mm:ss" (Postgres time). */
export function normalizeTimeForPg(t: string): string {
  const s = t.trim();
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return s;
}

/** Resposta API: "HH:mm" sem segundos desnecessários. */
export function formatHrTimeForApi(pg: string): string {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(pg);
  if (!m) return pg;
  return `${m[1]}:${m[2]}`;
}
