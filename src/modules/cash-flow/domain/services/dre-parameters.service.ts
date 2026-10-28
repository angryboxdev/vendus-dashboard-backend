import {
  DEFAULT_DRE_PARAMETERS,
  type DreParameters,
  type ResolvedDreParameters,
} from "../entities/dre-parameters.js";
import { InvalidDreParametersError } from "../errors.js";

/**
 * Parâmetros de um mês: os do próprio mês; senão as taxas do último mês anterior com valores (o
 * marketing é do mês e não se herda; a despesa de empréstimos herda-se, é uma prestação); senão os de omissão.
 */
export function resolveDreParameters(own: DreParameters | null, previous: DreParameters | null): ResolvedDreParameters {
  if (own) return { ...own, loanExpenseCents: own.loanExpenseCents ?? 0, source: "month" };
  if (previous) return { ...previous, loanExpenseCents: previous.loanExpenseCents ?? 0, marketingNetCents: { ...DEFAULT_DRE_PARAMETERS.marketingNetCents }, source: "inherited" };
  return { ...DEFAULT_DRE_PARAMETERS, marketingNetCents: { ...DEFAULT_DRE_PARAMETERS.marketingNetCents }, source: "default" };
}

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
  if ((p.platformCommissionPct / 100) * (1 + p.platformCommissionVatPct / 100) >= 1) {
    throw new InvalidDreParametersError("commission with VAT must be below 100%");
  }
}
