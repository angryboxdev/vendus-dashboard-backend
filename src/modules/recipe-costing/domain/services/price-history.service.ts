import type { PurchaseObservation, WeeklyPricePoint } from "../entities/price-history.js";

const DAY = 86_400_000;
const utc = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
};
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Semana ISO 8601 (segunda a domingo) de uma data YYYY-MM-DD: chave «2026-W41» e a segunda-feira. */
export function isoWeek(date: string): { week: string; weekStart: string } {
  const t = utc(date);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // 0 = segunda
  const monday = t - dow * DAY;
  const thursday = monday + 3 * DAY; // o ano ISO é o da quinta-feira
  const isoYear = new Date(thursday).getUTCFullYear();
  const jan4 = Date.UTC(isoYear, 0, 4);
  const week1Monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY;
  const n = Math.round((monday - week1Monday) / (7 * DAY)) + 1;
  return { week: `${isoYear}-W${String(n).padStart(2, "0")}`, weekStart: ymd(monday) };
}

/**
 * Série semanal das últimas `weeks` semanas até à semana de `today`: média PONDERADA pela quantidade
 * (nunca a média simples dos preços), semanas sem compra com o último preço anterior assinalado como
 * transportado, variação face à última semana com compras e semana em curso marcada como parcial.
 */
export function weeklyPriceHistory(observations: PurchaseObservation[], today: string, weeks = 26): WeeklyPricePoint[] {
  const current = isoWeek(today);
  const firstStart = utc(current.weekStart) - (weeks - 1) * 7 * DAY;
  const byWeek = new Map<string, PurchaseObservation[]>();
  const sorted = [...observations].filter((o) => o.quantity > 0).sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
  for (const o of sorted) {
    const k = isoWeek(o.invoiceDate).weekStart;
    byWeek.set(k, [...(byWeek.get(k) ?? []), o]);
  }

  // Último preço conhecido antes da janela (para transportar nas primeiras semanas).
  let last: { cents: number; week: string } | null = null;
  for (const [start, obs] of [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (utc(start) >= firstStart) break;
    last = { cents: avg(obs)!, week: isoWeek(start).week };
  }

  const out: WeeklyPricePoint[] = [];
  let lastWithPurchases: number | null = last?.cents ?? null;
  for (let t = firstStart; t <= utc(current.weekStart); t += 7 * DAY) {
    const start = ymd(t);
    const { week } = isoWeek(start);
    const obs = byWeek.get(start) ?? [];
    const quantity = obs.reduce((s, o) => s + o.quantity, 0);
    const netCents = obs.reduce((s, o) => s + o.netCents, 0);
    const average = avg(obs);
    out.push({
      week,
      weekStart: start,
      quantity,
      netCents,
      avgCentsPerUnit: average,
      carriedCentsPerUnit: average === null ? last?.cents ?? null : null,
      carriedFromWeek: average === null ? last?.week ?? null : null,
      changeRatio: average !== null && lastWithPurchases ? average / lastWithPurchases - 1 : null,
      partial: start === current.weekStart,
      observations: obs,
    });
    if (average !== null) {
      last = { cents: average, week };
      lastWithPurchases = average;
    }
  }
  return out;
}

function avg(obs: PurchaseObservation[]): number | null {
  const q = obs.reduce((s, o) => s + o.quantity, 0);
  return q > 0 ? obs.reduce((s, o) => s + o.netCents, 0) / q : null;
}

/** As `weeks` semanas ISO até à de `today` (a última é a semana em curso). */
export function weeksUntil(today: string, weeks: number): { week: string; weekStart: string; partial: boolean }[] {
  const current = isoWeek(today);
  const first = utc(current.weekStart) - (weeks - 1) * 7 * DAY;
  const out: { week: string; weekStart: string; partial: boolean }[] = [];
  for (let t = first; t <= utc(current.weekStart); t += 7 * DAY) {
    const start = ymd(t);
    out.push({ week: isoWeek(start).week, weekStart: start, partial: start === current.weekStart });
  }
  return out;
}

/** Fim (exclusivo) da semana que começa em `weekStart`, em ISO — limite para escolher a versão em vigor. */
export function weekEndIso(weekStart: string): string {
  return new Date(utc(weekStart) + 7 * DAY).toISOString();
}
