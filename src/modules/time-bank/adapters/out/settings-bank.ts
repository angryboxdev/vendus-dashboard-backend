import type { BankSettings } from "../../domain/entities/time-bank.js";

/** Parâmetros efetivos (settings, C4.5/C6.5) → regras do banco. Sem valor = desligado (ADR-0029). */
export function bankSettingsFrom(values: { key: string; value: unknown }[]): BankSettings {
  const get = (k: string) => values.find((v) => v.key === `time_tracking.bank.${k}`)?.value ?? null;
  const num = (k: string) => (typeof get(k) === "number" ? (get(k) as number) : null);
  return {
    period: get("period") === "until_yesterday" ? "until_yesterday" : "closed_month",
    excessValidation: get("excess_validation") === true,
    compensateBeyondBalance: get("compensate_beyond_balance") === true,
    paidAnnualLimitHours: num("paid_annual_limit_hours"),
    paidAfterLimit: get("paid_after_limit") === true,
    expiryDays: num("expiry_days"),
    holidayMode: get("holiday_mode") === "hours" ? "hours" : "leave_days",
    employeeSeesHistory: get("employee_sees_history") === true,
  };
}
