import type { BankCredit } from "../entities/cash-flow.js";
import type {
  CardSettlement,
  CashDeposit,
  DailyRestaurantPayments,
  SalesReconciliation,
  SalesReconciliationDay,
} from "../entities/sales-reconciliation.js";
import { isExcluded } from "./cash-flow-report.service.js";
import { daysBetween } from "./cash-flow-period.js";

/** Taxa do TPA esperada por omissão (≈ 1%, decisão do utilizador 2026-10-27) e tolerância. */
export const DEFAULT_CARD_FEE_PCT = 1;
export const DEFAULT_FEE_TOLERANCE_PCT = 0.5;

/** Dias de folga antes e depois do mês para ligar créditos às vendas (fins de semana, feriados). */
export const SETTLEMENT_MARGIN_DAYS = 7;

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

export interface BuildSalesReconciliationInput {
  period: SalesReconciliation["period"];
  /** Vendas diárias do Vendus — de `from − margem` a `to`. */
  sales: DailyRestaurantPayments[];
  /** Créditos do banco — de `from − margem` a `to + margem`. */
  credits: BankCredit[];
  expectedCardFeePct?: number;
  feeTolerancePct?: number;
}

/** Soma por dia de uma lista (data → cêntimos), por ordem de data. */
function byDate<T>(items: T[], date: (t: T) => string, cents: (t: T) => number): [string, number][] {
  const m = new Map<string, number>();
  for (const i of items) m.set(date(i), (m.get(date(i)) ?? 0) + cents(i));
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Cada crédito (somado por dia) cobre as vendas desde o dia do crédito anterior até à véspera do seu:
 * venda em D chega em D+1, e o crédito de segunda junta sexta, sábado e domingo. O primeiro crédito
 * da janela não tem anterior conhecido — cobre desde o início da janela e só conta se acabar no mês.
 */
function settle(
  credits: [string, number][],
  soldOn: (from: string, to: string) => number,
  windowStart: string,
  expected: number,
  tolerance: number,
): CardSettlement[] {
  const out: CardSettlement[] = [];
  let prev: string | null = null;
  for (const [creditDate, receivedCents] of credits) {
    const salesFrom = prev ?? windowStart;
    const salesTo = addDays(creditDate, -1);
    prev = creditDate;
    if (salesTo < salesFrom) continue;
    const soldCents = soldOn(salesFrom, salesTo);
    const differenceCents = soldCents - receivedCents;
    const impliedFeePct = pct(differenceCents, soldCents);
    const status: CardSettlement["status"] =
      soldCents <= 0 ? "no_sales" : impliedFeePct !== null && Math.abs(impliedFeePct - expected) <= tolerance ? "ok" : "check";
    out.push({ creditDate, salesFrom, salesTo, soldCents, receivedCents, differenceCents, impliedFeePct, status });
  }
  return out;
}

/**
 * Conferência do mês: cartão vendido (Vendus) × créditos TPA e numerário vendido × depósitos.
 * Uma diferença de um dia entre a venda e a entrada no banco é a regra, não um erro.
 */
export function buildSalesReconciliation(input: BuildSalesReconciliationInput): SalesReconciliation {
  const { period } = input;
  const expected = input.expectedCardFeePct ?? DEFAULT_CARD_FEE_PCT;
  const tolerance = input.feeTolerancePct ?? DEFAULT_FEE_TOLERANCE_PCT;
  const windowStart = addDays(period.from, -SETTLEMENT_MARGIN_DAYS);
  const inMonth = (d: string) => d >= period.from && d <= period.to;

  const salesByDate = new Map(input.sales.map((s) => [s.date, s]));
  const sumSales = (from: string, to: string, f: (s: DailyRestaurantPayments) => number) =>
    input.sales.reduce((a, s) => (s.date >= from && s.date <= to ? a + f(s) : a), 0);

  const counted = input.credits.filter((c) => !isExcluded(c));
  const cardCredits = byDate(counted.filter((c) => c.restaurantSale === "card"), (c) => c.date, (c) => c.amountCents);
  const cashCredits = byDate(counted.filter((c) => c.restaurantSale === "cash"), (c) => c.date, (c) => c.amountCents);

  // ── Cartão ──
  const settlements = settle(cardCredits, (f, t) => sumSales(f, t, (s) => s.cardCents), windowStart, expected, tolerance)
    .filter((s) => inMonth(s.salesTo));
  const lastCredit = cardCredits.length > 0 ? cardCredits[cardCredits.length - 1]![0] : null;
  const pendingFrom = lastCredit && lastCredit > period.from ? lastCredit : period.from;
  const pendingSold = pendingFrom <= period.to ? sumSales(pendingFrom, period.to, (s) => s.cardCents) : 0;
  const receivedCents = settlements.reduce((a, s) => a + s.receivedCents, 0);
  const settledSoldCents = settlements.reduce((a, s) => a + s.soldCents, 0);

  // ── Numerário ──
  const deposits: CashDeposit[] = [];
  let prevDeposit: string | null = null;
  for (const [date, depositedCents] of cashCredits) {
    const from = prevDeposit ?? windowStart;
    prevDeposit = date;
    if (!inMonth(date)) continue;
    deposits.push({ date, depositedCents, soldSincePreviousCents: sumSales(from, addDays(date, -1), (s) => s.cashCents) });
  }
  const cashSold = sumSales(period.from, period.to, (s) => s.cashCents);
  const depositedCents = deposits.reduce((a, d) => a + d.depositedCents, 0);

  // ── Dias do mês ──
  const cardByDay = new Map(cardCredits);
  const cashByDay = new Map(cashCredits);
  const days: SalesReconciliationDay[] = daysBetween(period.from, period.to).map((date) => ({
    date,
    cardSoldCents: salesByDate.get(date)?.cardCents ?? 0,
    cardReceivedCents: cardByDay.get(date) ?? 0,
    cashSoldCents: salesByDate.get(date)?.cashCents ?? 0,
    cashDepositedCents: cashByDay.get(date) ?? 0,
  }));

  return {
    period,
    expectedCardFeePct: expected,
    feeTolerancePct: tolerance,
    card: {
      soldCents: sumSales(period.from, period.to, (s) => s.cardCents),
      receivedCents,
      settledSoldCents,
      differenceCents: settledSoldCents - receivedCents,
      impliedFeePct: pct(settledSoldCents - receivedCents, settledSoldCents),
      expectedFeeCents: Math.round((settledSoldCents * expected) / 100),
      settlements,
      pending: pendingSold !== 0 ? { from: pendingFrom, to: period.to, soldCents: pendingSold } : null,
    },
    cash: { soldCents: cashSold, depositedCents, notDepositedCents: cashSold - depositedCents, deposits },
    days,
  };
}
