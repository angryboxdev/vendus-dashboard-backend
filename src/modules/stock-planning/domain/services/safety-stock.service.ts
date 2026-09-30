import { round6 } from "./numeric.js";

export interface SafetyStockInput {
  /** Consumo diário real recente (já convertido para o item de stock), usado só para estimar variabilidade. */
  recentDailyConsumption: number[];
  /** Dias até à próxima janela de reposição efetiva (secção 44). */
  leadTimeDays: number;
  /** Fator de nível de serviço (z-score); default 1.65 ≈ 95%. */
  serviceLevelZ?: number;
  /** `stock_items.safety_stock_qty` — override explícito do utilizador, sempre respeitado quando presente (secção 43). */
  configuredSafetyStockQty: number | null;
  /** `stock_items.min_stock` legacy — usado como piso só quando não há histórico suficiente nem valor configurado. */
  minStockQty: number;
}

export interface SafetyStockResult {
  suggestedQty: number;
  basis: "configured" | "dynamic" | "min_stock_floor";
}

const MIN_HISTORY_DAYS_FOR_DYNAMIC = 7;

/**
 * Sugestão dinâmica de stock de segurança (secção 44) — nunca sobrepõe
 * silenciosamente um valor já configurado pelo utilizador; distinta de
 * `min_stock` (secção 43). Sem histórico suficiente, cai para o piso
 * `min_stock` — nunca inventa uma variabilidade que não existe.
 */
export function computeSafetyStock(input: SafetyStockInput): SafetyStockResult {
  if (input.configuredSafetyStockQty != null && Number.isFinite(input.configuredSafetyStockQty) && input.configuredSafetyStockQty >= 0) {
    return { suggestedQty: round6(input.configuredSafetyStockQty), basis: "configured" };
  }

  const n = input.recentDailyConsumption.length;
  if (n < MIN_HISTORY_DAYS_FOR_DYNAMIC) {
    return { suggestedQty: round6(Math.max(0, input.minStockQty)), basis: "min_stock_floor" };
  }

  const mean = input.recentDailyConsumption.reduce((a, b) => a + b, 0) / n;
  const variance = input.recentDailyConsumption.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const z = input.serviceLevelZ ?? 1.65;
  const dynamic = z * stdDev * Math.sqrt(Math.max(1, input.leadTimeDays));

  return { suggestedQty: round6(Math.max(dynamic, input.minStockQty)), basis: "dynamic" };
}
