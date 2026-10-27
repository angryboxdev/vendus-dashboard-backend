import type { CashFlowPeriod } from "../entities/cash-flow.js";
import { InvalidCashFlowPeriodError } from "../errors.js";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Janela do relatório: o mês até hoje (mês corrente) ou inteiro (mês fechado), e a janela de
 * comparação — os mesmos dias do mês anterior, ou o mês anterior inteiro num mês fechado.
 */
export function cashFlowPeriod(year: number, month: number, today: string): CashFlowPeriod {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new InvalidCashFlowPeriodError("year must be a valid integer");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new InvalidCashFlowPeriodError("month must be between 1 and 12");

  const from = iso(year, month, 1);
  const monthEnd = iso(year, month, daysIn(year, month));
  if (from > today) throw new InvalidCashFlowPeriodError("month is in the future");

  const isCurrentMonth = today <= monthEnd;
  const to = isCurrentMonth ? today : monthEnd;

  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevDays = daysIn(prevYear, prevMonth);
  const lastDay = isCurrentMonth ? Math.min(Number(today.slice(8, 10)), prevDays) : prevDays;

  return {
    year,
    month,
    from,
    to,
    monthEnd,
    isCurrentMonth,
    previous: { from: iso(prevYear, prevMonth, 1), to: iso(prevYear, prevMonth, lastDay) },
  };
}

/** Todos os dias de `from` a `to` (inclusive), YYYY-MM-DD. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
