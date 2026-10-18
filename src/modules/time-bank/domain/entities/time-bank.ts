import { TimeBankValidationError } from "../errors.js";

/** Movimento do banco de horas (Eng. Reversa 6.1; ledger append-only — ADR-0029). */
export type EntryKind = "excess" | "deficit" | "multiplier" | "holiday" | "compensation_rest" | "compensation_paid" | "expiry" | "adjustment";
export const DAILY_KINDS: EntryKind[] = ["excess", "deficit", "multiplier", "holiday"];

export interface TimeBankEntry {
  id: string;
  employeeId: string;
  kind: EntryKind;
  /** Segundos com sinal: positivo soma ao banco, negativo tira. */
  seconds: number;
  /** Dia a que diz respeito. */
  workDate: string;
  /** Dia em que foi lançado (ajuste retroativo: hoje). */
  postedOn: string;
  paymentMonth: string | null;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export type NewEntry = Omit<TimeBankEntry, "id" | "createdAt"> & {
  /**
   * Chave de idempotência dos movimentos calculados pela sincronização
   * (ajustes e expirações): duas sincronizações com a mesma visão geram a
   * mesma chave e só uma grava. Movimentos manuais não têm chave.
   */
  syncKey?: string | null;
};

/** Ajuste de correção: chave = o estado do dia que o originou (nº de movimentos e soma). */
export const adjustmentSyncKey = (workDate: string, entriesOfDay: number, sumOfDay: number) => `adj:${workDate}:${entriesOfDay}:${sumOfDay}`;
/** Expiração: no máximo uma por dia lançada pela sincronização. */
export const expirySyncKey = (today: string) => `exp:${today}`;

/** Horas categorizadas (C4.6): janelas por dia da semana; fator > 1 = multiplicador. */
export interface HourWindow {
  weekdays: string[];
  start: string;
  end: string;
}

export interface HourCategory {
  id: string;
  name: string;
  validFrom: string;
  validTo: string | null;
  windows: HourWindow[];
  factor: number | null;
  archived: boolean;
}

export type HourCategoryInput = Omit<HourCategory, "id" | "archived">;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateCategory(c: HourCategoryInput): void {
  if (!c.name?.trim() || c.name.trim().length > 80) throw new TimeBankValidationError("O nome é obrigatório (máx. 80).", "name");
  if (!DATE.test(c.validFrom)) throw new TimeBankValidationError("Data de início inválida.", "validFrom");
  if (c.validTo !== null && (!DATE.test(c.validTo) || c.validTo < c.validFrom)) throw new TimeBankValidationError("Data de fim inválida.", "validTo");
  if (!Array.isArray(c.windows) || c.windows.length < 1 || c.windows.length > 20) throw new TimeBankValidationError("Indique pelo menos um intervalo.", "windows");
  for (const w of c.windows) {
    if (!Array.isArray(w.weekdays) || !w.weekdays.length || w.weekdays.some((d) => !/^[1-7]$/.test(d))) throw new TimeBankValidationError("Dias da semana inválidos.", "windows");
    if (!TIME.test(w.start) || !TIME.test(w.end) || w.start === w.end) throw new TimeBankValidationError("Intervalo horário inválido.", "windows");
  }
  if (c.factor !== null && (!Number.isFinite(c.factor) || c.factor <= 0 || c.factor > 5)) throw new TimeBankValidationError("O fator tem de estar entre 0 e 5.", "factor");
}

/** Regras do banco em vigor num dia (vêm do motor de configurações). */
export interface BankSettings {
  period: "closed_month" | "until_yesterday";
  excessValidation: boolean;
  compensateBeyondBalance: boolean;
  paidAnnualLimitHours: number | null;
  paidAfterLimit: boolean;
  expiryDays: number | null;
  holidayMode: "leave_days" | "hours";
  employeeSeesHistory: boolean;
}
