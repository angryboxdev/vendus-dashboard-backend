import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { DemandPredictionInput, RecipeConsumptionPort, RecipeConsumptionResult } from "../../domain/ports/out/recipe-consumption.port.js";

/**
 * Fake configurável por um mapa `demandSourceIdentity -> { stockItemId, factor }[]`
 * (fatores de consumo por unidade vendida) — simula
 * `computeConsumptionForProductLinesLenient` sem tocar nas tabelas legacy
 * reais. Fontes sem entrada no mapa contam como "sem ficha técnica"
 * (secção 18 — nunca inventa consumo).
 */
export class FakeRecipeConsumption implements RecipeConsumptionPort {
  factorsBySource = new Map<string, { stockItemId: string; factor: number }[]>();

  async convert(_organizationId: OrganizationId, predictions: DemandPredictionInput[]): Promise<RecipeConsumptionResult> {
    const byStockItemAndDate: RecipeConsumptionResult["byStockItemAndDate"] = [];
    const contributions: RecipeConsumptionResult["contributions"] = [];
    const incompleteDemandSources = new Set<string>();
    const merged = new Map<string, number>();

    for (const p of predictions) {
      const identity = `${p.demandSourceType}:${p.demandSourceRef}`;
      const factors = this.factorsBySource.get(identity);
      if (!factors) {
        incompleteDemandSources.add(identity);
        continue;
      }
      for (const f of factors) {
        const qty = f.factor * p.predictedQuantity;
        contributions.push({ demandSourceType: p.demandSourceType, demandSourceRef: p.demandSourceRef, stockItemId: f.stockItemId, contributedQty: qty });
        const key = `${f.stockItemId}:${p.date}`;
        merged.set(key, (merged.get(key) ?? 0) + qty);
      }
    }

    for (const [key, expectedConsumption] of merged) {
      const separatorIndex = key.lastIndexOf(":");
      byStockItemAndDate.push({ stockItemId: key.slice(0, separatorIndex), date: key.slice(separatorIndex + 1), expectedConsumption });
    }

    return { byStockItemAndDate, contributions, incompleteDemandSources: [...incompleteDemandSources] };
  }
}
