import { InvalidVatPeriodError } from "../errors.js";

export type VatPeriodicity = "monthly" | "quarterly";

export interface VatPeriodRange {
  from: string;
  to: string;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function periodsInYear(periodicity: VatPeriodicity): number {
  return periodicity === "monthly" ? 12 : 4;
}

/** Generaliza a Fase 1 (só trimestre) — mês vira "período 1..12", trimestre continua "período 1..4". */
export function getVatPeriodRange(periodicity: VatPeriodicity, year: number, period: number): VatPeriodRange {
  const maxPeriod = periodsInYear(periodicity);
  if (!Number.isInteger(period) || period < 1 || period > maxPeriod) {
    throw new InvalidVatPeriodError(periodicity, period);
  }

  if (periodicity === "monthly") {
    const from = new Date(Date.UTC(year, period - 1, 1));
    const to = new Date(Date.UTC(year, period, 0));
    return { from: toIsoDate(from), to: toIsoDate(to) };
  }

  const startMonth = (period - 1) * 3;
  const from = new Date(Date.UTC(year, startMonth, 1));
  const to = new Date(Date.UTC(year, startMonth + 3, 0));
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

export function currentVatPeriod(periodicity: VatPeriodicity, now: Date = new Date()): { year: number; period: number } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const period = periodicity === "monthly" ? month : Math.ceil(month / 3);
  return { year, period };
}
