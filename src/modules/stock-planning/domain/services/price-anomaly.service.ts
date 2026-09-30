import { round6 } from "./numeric.js";

export interface PriceAnomalyInput {
  /** `stock_movements` mais recente do tipo `purchase` (já lido via `StockQuantityReadPort`, nunca inventado). */
  lastPurchaseUnitCost: number | null;
  /** `stock_items.purchase_reference_unit_cost_without_vat` — referência de catálogo. */
  referenceUnitCost: number | null;
  /** Fração (0.15 = 15%) — configurável, nunca hardcoded (secção 56). */
  thresholdPercent: number;
}

export interface PriceAnomalyResult {
  isAnomaly: boolean;
  /** `null` quando não há os dois valores para comparar — nunca inventa uma referência. */
  deviationPercent: number | null;
}

/**
 * Deteção de anomalia de preço a partir de dados já existentes
 * (`stock_movements.unit_cost_per_base_unit_without_vat` e
 * `stock_items.purchase_reference_unit_cost_without_vat`) — nunca uma
 * tabela nova de histórico de preço (secção 53, já reaproveitado).
 *
 * Comparação multi-fornecedor totalmente normalizada por unidade base
 * (secções 53-55) fica documentada como gap conhecido no README: o schema
 * atual não atribui `stock_movements`/`stock_review_lines` a um fornecedor
 * de forma direta e sem ambiguidade (nenhuma coluna `supplier_id` em
 * `stock_movements`), e um join através de `stock_review_lines.review_id →
 * stock_purchase_reviews.decision_supplier_id` foi avaliado como possível
 * mas arriscado de validar sem acesso a uma BD real nesta ronda — por isso
 * esta função compara só "última compra vs. referência de catálogo",
 * ambos já dados reais e não inventados.
 */
export function detectPriceAnomaly(input: PriceAnomalyInput): PriceAnomalyResult {
  if (input.lastPurchaseUnitCost == null || input.referenceUnitCost == null || input.referenceUnitCost <= 0) {
    return { isAnomaly: false, deviationPercent: null };
  }
  const deviation = (input.lastPurchaseUnitCost - input.referenceUnitCost) / input.referenceUnitCost;
  return { isAnomaly: deviation >= input.thresholdPercent, deviationPercent: round6(deviation) };
}
