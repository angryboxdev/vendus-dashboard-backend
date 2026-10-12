import { DateTime } from "luxon";
import { DAILY_KINDS, type HourCategory, type NewEntry, type TimeBankEntry } from "../entities/time-bank.js";

/** Dia apurado pela assiduidade (o único motor de totais — RE-6). */
export interface BankDay {
  workDate: string;
  workedSeconds: number;
  excessSeconds: number;
  segments: { start: string; end: string; type: string; autoClosed?: boolean; forgotten?: boolean }[];
}

export interface DayContext {
  timeZone: string;
  /** C6.5 em vigor nesse dia (CF-6: nunca retroativo). */
  validationRequired: boolean;
  validation: "approved" | "rejected" | null;
  categories: HourCategory[];
  holiday: { coefficient: number } | null;
  holidayMode: "leave_days" | "hours";
}

export interface DayTarget {
  base: { kind: "excess" | "deficit"; seconds: number };
  multiplier: number;
  holiday: number;
  /** Excedente à espera de validação (não entra). */
  pendingValidation: boolean;
}

const WORKING = new Set(["work", "remote", "break_paid"]);
const overlap = (a1: number, a2: number, b1: number, b2: number) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

/** Segundos trabalhados dentro das janelas de uma categoria nesse dia (C4.6). */
export function secondsInCategory(day: BankDay, c: HourCategory, timeZone: string): number {
  if (c.archived || day.workDate < c.validFrom || (c.validTo !== null && day.workDate > c.validTo)) return 0;
  const weekday = String(DateTime.fromISO(day.workDate, { zone: timeZone }).weekday);
  let total = 0;
  for (const w of c.windows) {
    if (!w.weekdays.includes(weekday)) continue;
    const ws = DateTime.fromISO(`${day.workDate}T${w.start}`, { zone: timeZone });
    let we = DateTime.fromISO(`${day.workDate}T${w.end}`, { zone: timeZone });
    if (we <= ws) we = we.plus({ days: 1 });
    for (const s of day.segments) {
      if (!WORKING.has(s.type) || s.forgotten) continue;
      total += overlap(Date.parse(s.start), Date.parse(s.end), ws.toMillis(), we.toMillis());
    }
  }
  return Math.round(total / 1000);
}

/** O que o banco deve ter para um dia fechado. */
export function dayTarget(day: BankDay, ctx: DayContext): DayTarget {
  let excess = day.excessSeconds;
  let pendingValidation = false;
  if (excess > 0 && ctx.validationRequired && ctx.validation !== "approved") {
    pendingValidation = ctx.validation === null;
    excess = 0;
  }
  let multiplier = 0;
  for (const c of ctx.categories) {
    if (c.factor !== null && c.factor > 1) multiplier += Math.round(secondsInCategory(day, c, ctx.timeZone) * (c.factor - 1));
  }
  const holiday = ctx.holidayMode === "hours" && ctx.holiday && ctx.holiday.coefficient > 1 ? Math.round(day.workedSeconds * (ctx.holiday.coefficient - 1)) : 0;
  return { base: { kind: excess < 0 ? "deficit" : "excess", seconds: excess }, multiplier, holiday, pendingValidation };
}

const targetTotal = (t: DayTarget) => t.base.seconds + t.multiplier + t.holiday;

/**
 * Movimentos a lançar para um dia (append-only):
 * - nunca lançado → movimento diário, mesmo a zero (marca o dia como incluído), + multiplicador/feriado;
 * - já lançado e diferente → ajuste datado de hoje com referência ao dia (RE-29).
 */
export function postingsFor(workDate: string, target: DayTarget, posted: TimeBankEntry[], today: string, by: string): Omit<NewEntry, "employeeId">[] {
  const forDay = posted.filter((e) => e.workDate === workDate && (DAILY_KINDS.includes(e.kind) || e.kind === "adjustment"));
  const hasDaily = forDay.some((e) => e.kind === "excess" || e.kind === "deficit");
  const entry = (kind: NewEntry["kind"], seconds: number, reason: string, postedOn = workDate) => ({ kind, seconds, workDate, postedOn, paymentMonth: null, reason, createdBy: by });
  if (!hasDaily) {
    const out = [entry(target.base.kind, target.base.seconds, target.base.kind === "excess" ? "Excedente de tempo" : "Défice de tempo")];
    if (target.multiplier) out.push(entry("multiplier", target.multiplier, "Horas com multiplicador"));
    if (target.holiday) out.push(entry("holiday", target.holiday, "Feriado trabalhado"));
    return out;
  }
  const diff = targetTotal(target) - forDay.reduce((s, e) => s + e.seconds, 0);
  return diff === 0 ? [] : [entry("adjustment", diff, `Correção do dia ${workDate}`, today)];
}

/** Último dia que entra no banco (D11): fim do mês anterior ou ontem. */
export function cutoff(period: "closed_month" | "until_yesterday", today: string): string {
  const d = DateTime.fromISO(today, { zone: "utc" });
  return (period === "closed_month" ? d.startOf("month").minus({ days: 1 }) : d.minus({ days: 1 })).toISODate()!;
}

/**
 * Expiração (C4.5): horas positivas geradas antes de `today − days` que ainda
 * não foram consumidas (as mais antigas primeiro). Horas negativas não expiram.
 * Devolve os segundos a expirar (≥ 0).
 */
export function toExpire(entries: TimeBankEntry[], today: string, days: number | null): number {
  if (days === null) return 0;
  const limit = DateTime.fromISO(today, { zone: "utc" }).minus({ days }).toISODate()!;
  const oldPositive = entries.filter((e) => e.seconds > 0 && e.kind !== "expiry" && e.workDate < limit).reduce((s, e) => s + e.seconds, 0);
  const consumed = entries.filter((e) => e.seconds < 0 && e.kind !== "expiry").reduce((s, e) => s - e.seconds, 0);
  const expired = entries.filter((e) => e.kind === "expiry").reduce((s, e) => s - e.seconds, 0);
  return Math.max(0, oldPositive - consumed - expired);
}

export interface LedgerRow extends TimeBankEntry {
  running: number;
}

/** Ledger por dia com acumulado (RE-26), pela ordem do dia e do lançamento. */
export function running(entries: TimeBankEntry[]): LedgerRow[] {
  let acc = 0;
  return [...entries]
    .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map((e) => ({ ...e, running: (acc += e.seconds) }));
}

export function summary(entries: TimeBankEntry[]) {
  const sum = (kinds: TimeBankEntry["kind"][]) => entries.filter((e) => kinds.includes(e.kind)).reduce((s, e) => s + e.seconds, 0);
  return {
    balance: entries.reduce((s, e) => s + e.seconds, 0),
    generated: sum(["excess", "deficit", "multiplier", "holiday", "adjustment"]),
    compensatedRest: -sum(["compensation_rest"]),
    compensatedPaid: -sum(["compensation_paid"]),
    expired: -sum(["expiry"]),
  };
}
