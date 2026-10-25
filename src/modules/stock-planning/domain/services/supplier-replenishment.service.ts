/** Dados de um artigo já reunidos pelas leituras (sem regras). */
export interface ReplenishmentInput {
  stockItemId: string;
  name: string;
  categoryName: string | null;
  baseUnit: string;
  currentQuantity: number;
  minStockQty: number;
  consumption30d: number;
  /** Recomendação do último run da loja, quando existe. */
  recommendation: { suggestedBaseQty: number; suggestedPurchaseQty: number | null; purchaseUnit: string | null } | null;
  lastPurchase: { date: string; unitCostWithoutVat: number; supplierItemCode: string | null; purchaseUnit: string | null } | null;
}

export interface ReplenishmentRow {
  stockItemId: string;
  name: string;
  code: string | null;
  categoryName: string | null;
  baseUnit: string;
  currentQuantity: number;
  minStockQty: number;
  consumption30d: number;
  /** Sugestão em unidade base (0 = nada a encomendar). */
  suggestedBaseQty: number;
  /** Sugestão em unidades de compra, quando a previsão a converteu. */
  suggestedPurchaseQty: number | null;
  purchaseUnit: string | null;
  /** «forecast» = recomendação do Planeamento; «min_stock» = só repor até ao stock mínimo. */
  suggestionSource: "forecast" | "min_stock" | null;
  lastPurchaseDate: string | null;
  lastUnitPrice: number | null;
  needsReplenishment: boolean;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Uma linha por artigo: a sugestão vem da recomendação do Planeamento; sem
 * ela, só se sugere repor até ao stock mínimo (nunca se inventa procura).
 * Com necessidade primeiro, depois por nome.
 */
export function buildReplenishmentRows(inputs: ReplenishmentInput[]): ReplenishmentRow[] {
  return inputs
    .map((i): ReplenishmentRow => {
      const belowMin = i.minStockQty > 0 && i.currentQuantity < i.minStockQty;
      const fromForecast = i.recommendation && i.recommendation.suggestedBaseQty > 0 ? i.recommendation : null;
      const suggestedBaseQty = fromForecast ? fromForecast.suggestedBaseQty : belowMin ? i.minStockQty - i.currentQuantity : 0;
      return {
        stockItemId: i.stockItemId,
        name: i.name,
        code: i.lastPurchase?.supplierItemCode ?? null,
        categoryName: i.categoryName,
        baseUnit: i.baseUnit,
        currentQuantity: round(i.currentQuantity),
        minStockQty: round(i.minStockQty),
        consumption30d: round(i.consumption30d),
        suggestedBaseQty: round(suggestedBaseQty),
        suggestedPurchaseQty: fromForecast?.suggestedPurchaseQty ?? null,
        purchaseUnit: fromForecast?.purchaseUnit ?? i.lastPurchase?.purchaseUnit ?? null,
        suggestionSource: fromForecast ? "forecast" : suggestedBaseQty > 0 ? "min_stock" : null,
        lastPurchaseDate: i.lastPurchase?.date ?? null,
        lastUnitPrice: i.lastPurchase?.unitCostWithoutVat ?? null,
        needsReplenishment: suggestedBaseQty > 0 || belowMin,
      };
    })
    .sort((a, b) => Number(b.needsReplenishment) - Number(a.needsReplenishment) || a.name.localeCompare(b.name, "pt"));
}
