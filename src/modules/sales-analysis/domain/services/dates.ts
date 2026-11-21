import type { DateRange, IsoDate } from "../entities/sales-analysis.js";

/** Aritmética de datas de calendário (AAAA-MM-DD), sem fuso: o fuso resolve-se nos adapters. */

const pad = (n: number) => String(n).padStart(2, "0");

export function isIsoDate(s: unknown): s is IsoDate {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(d: IsoDate, n: number): IsoDate {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function dayCount(r: DateRange): number {
  return daysBetween(r.from, r.to) + 1;
}

export function eachDay(r: DateRange): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Mesmo dia noutro mês; se o dia não existir (31 → 30), fica no último dia. */
export function shiftMonth(d: IsoDate, by: number): IsoDate {
  const [y = 0, m = 1, dd = 1] = d.split("-").map(Number);
  const idx = y * 12 + (m - 1) + by;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(dd, daysInMonth(ny, nm)))}`;
}

export function shiftYear(d: IsoDate, by: number): IsoDate {
  return shiftMonth(d, by * 12);
}

export function shiftRange(r: DateRange, months: number): DateRange {
  return { from: shiftMonth(r.from, months), to: shiftMonth(r.to, months) };
}

export function monthOf(d: IsoDate): string {
  return d.slice(0, 7);
}

export function monthsOf(r: DateRange): string[] {
  const out: string[] = [];
  let [y = 0, m = 1] = r.from.split("-").map(Number);
  const [ty = 0, tm = 1] = r.to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${pad(m)}`);
    m++;
    if (m === 13) { m = 1; y++; }
  }
  return out;
}

export function monthRange(month: string): DateRange {
  const [y = 0, m = 1] = month.split("-").map(Number);
  return { from: `${month}-01`, to: `${month}-${pad(daysInMonth(y, m))}` };
}

/** Interseção de dois intervalos (null se não se tocarem). */
export function intersect(a: DateRange, b: DateRange): DateRange | null {
  const from = a.from > b.from ? a.from : b.from;
  const to = a.to < b.to ? a.to : b.to;
  return from <= to ? { from, to } : null;
}

/** Junta datas soltas em intervalos contíguos, cada um com no máximo `maxDays` dias. */
export function toContiguousRanges(dates: IsoDate[], maxDays: number): DateRange[] {
  const sorted = [...new Set(dates)].sort();
  const out: DateRange[] = [];
  for (const d of sorted) {
    const last = out[out.length - 1];
    if (last && addDays(last.to, 1) === d && dayCount(last) < maxDays) last.to = d;
    else out.push({ from: d, to: d });
  }
  return out;
}

/** 0 = domingo … 6 = sábado. */
export function weekday(d: IsoDate): number {
  return new Date(`${d}T00:00:00Z`).getUTCDay();
}
