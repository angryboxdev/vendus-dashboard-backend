import type { TolerancePolicy } from "./tolerance.service.js";

export interface VarianceResult {
  absolute: number;
  /** `null` sempre que `systemQuantity <= 0` — nunca `Infinity`/`NaN` (secção 18 da task). */
  percent: number | null;
}

/**
 * `percent = teórico > 0 ? abs(absolute)/abs(teórico) : null`. Guardado
 * explicitamente contra `Infinity`/`NaN` mesmo quando `systemQuantity` é um
 * número negativo (stock teórico corrompido/negativo) — nesses casos
 * também devolve `null`, nunca um número inválido.
 */
export function computeVariance(countedQuantity: number, systemQuantity: number): VarianceResult {
  const absolute = countedQuantity - systemQuantity;
  const percent = systemQuantity > 0 && Number.isFinite(systemQuantity) ? Math.abs(absolute) / Math.abs(systemQuantity) : null;
  return { absolute, percent };
}

/**
 * Impacto financeiro só calculado quando existe um custo unitário confiável
 * no item — senão `null` (nunca inventado, secção 39 da task).
 */
export function computeFinancialImpact(absoluteVariance: number, unitCostWithoutVat: number | null | undefined): number | null {
  if (unitCostWithoutVat == null || !Number.isFinite(unitCostWithoutVat)) return null;
  return absoluteVariance * unitCostWithoutVat;
}

/**
 * Compara a variância contra a política de tolerância resolvida. `false`
 * quando não há política configurada (`tolerance === null`) — a ausência de
 * tolerância nunca dispara recontagem automática sozinha (o disparo por
 * movimento durante a contagem é decidido à parte, nunca aqui).
 */
export function breachesTolerance(variance: VarianceResult, financialImpact: number | null, tolerance: TolerancePolicy | null): boolean {
  if (!tolerance) return false;
  if (tolerance.absoluteQty != null && Math.abs(variance.absolute) > tolerance.absoluteQty) return true;
  if (tolerance.percent != null && variance.percent != null && variance.percent > tolerance.percent) return true;
  if (tolerance.financialImpact != null && financialImpact != null && Math.abs(financialImpact) > tolerance.financialImpact) return true;
  return false;
}
