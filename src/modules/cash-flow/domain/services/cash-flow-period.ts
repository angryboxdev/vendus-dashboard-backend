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

/** Meses de pagamentos lidos antes e depois do mês da DRE (faturas pagas adiantadas ou a prazo). */
export const DRE_PAYMENTS_MONTHS_BEFORE = 1;
export const DRE_PAYMENTS_MONTHS_AFTER = 3;

/**
 * Janela de pagamentos da DRE: do 1.º dia de `DRE_PAYMENTS_MONTHS_BEFORE` meses antes ao último dia de
 * `DRE_PAYMENTS_MONTHS_AFTER` meses depois, sem passar de hoje. Cada pagamento conta depois no mês
 * da competência do seu documento.
 */
export function drePaymentsWindow(year: number, month: number, today: string): { from: string; to: string } {
  const shift = (n: number) => {
    const d = new Date(Date.UTC(year, month - 1 + n, 1));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
  };
  const a = shift(-DRE_PAYMENTS_MONTHS_BEFORE);
  const b = shift(DRE_PAYMENTS_MONTHS_AFTER);
  const end = iso(b.y, b.m, daysIn(b.y, b.m));
  return { from: iso(a.y, a.m, 1), to: end < today ? end : today };
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
