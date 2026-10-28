import {
  DEFAULT_DRE_PARAMETERS,
  type DreParameters,
  type ResolvedDreParameters,
} from "../entities/dre-parameters.js";
import { InvalidDreParametersError } from "../errors.js";

/**
 * Parâmetros de um mês: os do próprio mês; senão as taxas do último mês anterior com valores (o
 * marketing é do mês e não se herda; a despesa de empréstimos e a renda variável herdam-se); senão os de omissão.
 */
export function resolveDreParameters(own: DreParameters | null, previous: DreParameters | null): ResolvedDreParameters {
  if (own) return { ...withControlDefaults(own), source: "month" };
  if (previous) return { ...withControlDefaults(previous), marketingNetCents: { ...DEFAULT_DRE_PARAMETERS.marketingNetCents }, source: "inherited" };
  return { ...DEFAULT_DRE_PARAMETERS, marketingNetCents: { ...DEFAULT_DRE_PARAMETERS.marketingNetCents }, source: "default" };
}

/** Campos do «Controle geral» que um mês gravado antes deles não tem: valem 0. */
const withControlDefaults = (p: DreParameters): DreParameters => ({
  ...p,
  loanExpenseCents: p.loanExpenseCents ?? 0,
  rentThresholdCents: p.rentThresholdCents ?? 0,
  rentVariablePct: p.rentVariablePct ?? 0,
});

const PCT_FIELDS = [
  "deliverySalesVatPct",
  "platformCommissionPct",
  "platformCommissionVatPct",
  "marketingVatPct",
  "cardFeePct",
  "expenseDefaultVatPct",
] as const;

/** Valida os parâmetros a gravar: percentagens 0–100, marketing inteiro ≥ 0, comissão com IVA < 100%. */
export function validateDreParameters(p: DreParameters): void {
  for (const f of PCT_FIELDS) {
    const v = p[f];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) throw new InvalidDreParametersError(`${f} must be between 0 and 100`);
  }
  if (typeof p.commissionOnGross !== "boolean") throw new InvalidDreParametersError("commissionOnGross must be a boolean");
  for (const [platform, cents] of Object.entries(p.marketingNetCents ?? {})) {
    if (!Number.isInteger(cents) || cents < 0) throw new InvalidDreParametersError(`marketingNetCents.${platform} must be a non-negative integer`);
  }
  if (p.loanExpenseCents !== undefined && (!Number.isInteger(p.loanExpenseCents) || p.loanExpenseCents < 0)) {
    throw new InvalidDreParametersError("loanExpenseCents must be a non-negative integer");
  }
  if (p.rentThresholdCents !== undefined && (!Number.isInteger(p.rentThresholdCents) || p.rentThresholdCents < 0)) {
    throw new InvalidDreParametersError("rentThresholdCents must be a non-negative integer");
  }
  if (p.rentVariablePct !== undefined && (typeof p.rentVariablePct !== "number" || !Number.isFinite(p.rentVariablePct) || p.rentVariablePct < 0 || p.rentVariablePct > 100)) {
    throw new InvalidDreParametersError("rentVariablePct must be between 0 and 100");
  }
  if ((p.platformCommissionPct / 100) * (1 + p.platformCommissionVatPct / 100) >= 1) {
    throw new InvalidDreParametersError("commission with VAT must be below 100%");
  }
}
