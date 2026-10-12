import { DateTime } from "luxon";
import type { LeaveRules, TimeImpact } from "../entities/absence-type.js";
import type { LedgerEntry } from "../entities/request.js";

/** Dia planeado (do módulo time-base): minutos teóricos e faixas do horário. */
export interface PlanDay {
  date: string;
  minutes: number;
  plannedRanges: { start: string; end: string }[];
}

export interface AmountInput {
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  halfDay: boolean;
}

export type AmountResult = { amount: number; unavailable: null } | { amount: 0; unavailable: string };

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Quanto um pedido consome (Eng. Reversa 5.2, verificado):
 * - dias corridos → todos os dias (RE-20: 03/06–26/07 = 54);
 * - dias úteis → só dias com tempo teórico; início ou fim num dia sem trabalho → indisponível (RE-19);
 * - horas → só o que coincide com o horário planeado (RE-21/CF-8: 09:00–12:00 com 2h30 no horário = 2,5 h).
 */
export function requestAmount(rules: LeaveRules, days: PlanDay[], i: AmountInput): AmountResult {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const works = (date: string) => (byDate.get(date)?.minutes ?? 0) > 0;
  if (rules.unit === "hours") {
    if (!i.startTime || !i.endTime || i.startDate !== i.endDate) return { amount: 0, unavailable: i.startDate };
    const a = toMin(i.startTime);
    const b = i.endTime <= i.startTime ? 1440 : toMin(i.endTime);
    const day = byDate.get(i.startDate);
    let minutes: number;
    if (!rules.intersectSchedule) minutes = b - a;
    else if (day && day.plannedRanges.length) {
      minutes = day.plannedRanges.reduce((s, r) => {
        const rs = toMin(r.start);
        const re = r.end <= r.start ? 1440 : toMin(r.end);
        return s + Math.max(0, Math.min(b, re) - Math.max(a, rs));
      }, 0);
    } else minutes = Math.min(b - a, day?.minutes ?? 0); // horário flexível: até ao teórico do dia
    return minutes > 0 ? { amount: round2(minutes / 60), unavailable: null } : { amount: 0, unavailable: i.startDate };
  }
  const dates: string[] = [];
  for (let d = i.startDate; d <= i.endDate; d = DateTime.fromISO(d, { zone: "utc" }).plus({ days: 1 }).toISODate()!) dates.push(d);
  if (rules.counting === "working") {
    if (!works(i.startDate)) return { amount: 0, unavailable: i.startDate };
    if (!works(i.endDate)) return { amount: 0, unavailable: i.endDate };
  }
  const counted = rules.counting === "calendar" ? dates.length : dates.filter(works).length;
  if (i.halfDay) return { amount: 0.5, unavailable: null };
  return { amount: counted, unavailable: null };
}

/** Início do período do saldo: 1 de janeiro, ou o aniversário do contrato (ano de trabalho). */
export function periodStart(renewal: LeaveRules["renewal"], date: string, contractStart: string | null): string {
  if (renewal === "calendar_year" || !contractStart) return `${date.slice(0, 4)}-01-01`;
  const d = DateTime.fromISO(date, { zone: "utc" });
  const c = DateTime.fromISO(contractStart, { zone: "utc" });
  let start = c.set({ year: d.year });
  if (start > d) start = start.minus({ years: 1 });
  return start.toISODate()!;
}

/** Acumulação do período: limite + dias por antiguidade (anos completos no início do período). */
export function accrualFor(rules: LeaveRules, period: string, contractStart: string | null): number | null {
  if (rules.limit === null) return null;
  let extra = 0;
  if (contractStart && rules.seniority.length) {
    const years = Math.floor(DateTime.fromISO(period, { zone: "utc" }).diff(DateTime.fromISO(contractStart, { zone: "utc" }), "years").years);
    for (const r of rules.seniority) if (years >= r.afterYears) extra = Math.max(extra, r.extra);
  }
  return rules.limit + extra;
}

export interface BalanceSummary {
  accrued: number;
  used: number;
  adjusted: number;
  balance: number;
  pending: number;
  available: number;
}

/** Saldo = soma do ledger; disponível = saldo − pedidos pendentes (reservados). */
export function summarize(entries: LedgerEntry[], pending: number): BalanceSummary {
  const sum = (kinds: LedgerEntry["kind"][]) => round2(entries.filter((e) => kinds.includes(e.kind)).reduce((s, e) => s + e.amount, 0));
  const balance = round2(entries.reduce((s, e) => s + e.amount, 0));
  return {
    accrued: sum(["accrual", "carryover", "holiday_compensation"]),
    used: round2(-sum(["request", "reversal"])),
    adjusted: sum(["adjustment", "expiry"]),
    balance,
    pending: round2(pending),
    available: round2(balance - pending),
  };
}

/** Efeito de uma ausência aprovada num dia (CF-7). */
export interface DayEffect {
  /** Minutos a tirar ao teórico. */
  reduceMinutes: number;
  /** Minutos a somar ao trabalhado. */
  creditMinutes: number;
  excused: boolean;
}

export function absenceEffect(theoreticalMinutes: number, impact: TimeImpact, minutes: number | "full"): DayEffect {
  const m = minutes === "full" ? theoreticalMinutes : Math.min(minutes, theoreticalMinutes);
  if (impact === "reduce_theoretical") return { reduceMinutes: m, creditMinutes: 0, excused: true };
  if (impact === "count_as_worked") return { reduceMinutes: 0, creditMinutes: m, excused: true };
  return { reduceMinutes: 0, creditMinutes: 0, excused: true };
}
