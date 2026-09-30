import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { getAllConsumptionMappingsMap, type ConsumptionMappingEntry } from "../../../../services/vendusMappingService.js";
import { computeConsumptionForProductLinesLenient } from "../../../../services/stockAdjustmentFromLinesService.js";
import type {
  DemandPredictionInput,
  RecipeConsumptionPort,
  RecipeConsumptionResult,
  StockConsumptionByDate,
} from "../../domain/ports/out/recipe-consumption.port.js";
import type { ConsumptionContribution, DemandSourceType } from "../../domain/services/impact-simulation.service.js";

/**
 * Reaproveita `computeConsumptionForProductLinesLenient`
 * (`src/services/stockAdjustmentFromLinesService.ts`) — exceção deliberada
 * e documentada à regra "nunca importar serviço legacy" do CLAUDE.md (ver
 * README). Nunca reimplementa a matemática de receita/preparo/Preparo
 * (`use_as_unit`/`yield_qty`) — só traduz a identidade de "fonte de
 * procura" (pizza_id+size ou stock_item_id) de volta para o par
 * title/reference que essa função legacy espera, porque a função legacy
 * resolve por `vendus_product_mapping.match_by/match_value`, não por
 * pizza_id/stock_item_id diretamente.
 *
 * Otimização importante: a conversão é linear na quantidade vendida (a
 * receita não muda por dia), por isso este adapter chama a função legacy
 * **uma vez por fonte de procura, com qty=1**, para obter o "fator de
 * consumo por unidade vendida" — e depois multiplica esse fator pela
 * quantidade prevista de cada dia em memória (sem I/O extra). Isto evita
 * chamar a função legacy (que por sua vez lê `pizza_recipes`/
 * `pizza_recipe_items`/`preparations` da BD) uma vez por dia do horizonte
 * × fonte de procura, o que seria proporcionalmente mais caro sem nenhum
 * ganho de exatidão.
 */
export class LegacyRecipeConsumptionAdapter implements RecipeConsumptionPort {
  async convert(organizationId: OrganizationId, predictions: DemandPredictionInput[]): Promise<RecipeConsumptionResult> {
    const mappingsMap = await getAllConsumptionMappingsMap(organizationId);
    const reverseIndex = buildReverseIndex(mappingsMap);

    const bySource = new Map<string, DemandPredictionInput[]>();
    for (const p of predictions) {
      const identity = `${p.demandSourceType}:${p.demandSourceRef}`;
      const list = bySource.get(identity) ?? [];
      list.push(p);
      bySource.set(identity, list);
    }

    const factorCache = new Map<string, Map<string, number> | null>();
    const rawByStockItemAndDate: StockConsumptionByDate[] = [];
    const contributions: ConsumptionContribution[] = [];
    const incompleteDemandSources = new Set<string>();

    for (const [identity, group] of bySource) {
      let factorMap = factorCache.get(identity);
      if (factorMap === undefined) {
        const lineRef = reverseIndex.get(identity);
        if (!lineRef) {
          factorMap = null;
        } else {
          const { map, skipped } = await computeConsumptionForProductLinesLenient(organizationId, [{ ...lineRef, qty: 1 }]);
          factorMap = skipped.length > 0 || map.size === 0 ? null : map;
        }
        factorCache.set(identity, factorMap);
      }

      if (!factorMap) {
        incompleteDemandSources.add(identity);
        continue;
      }

      const separatorIndex = identity.indexOf(":");
      const demandSourceType = identity.slice(0, separatorIndex) as DemandSourceType;
      const demandSourceRef = identity.slice(separatorIndex + 1);

      for (const p of group) {
        for (const [stockItemId, factor] of factorMap) {
          const contributedQty = factor * p.predictedQuantity;
          rawByStockItemAndDate.push({ stockItemId, date: p.date, expectedConsumption: contributedQty });
          contributions.push({ demandSourceType, demandSourceRef, stockItemId, contributedQty });
        }
      }
    }

    return {
      byStockItemAndDate: mergeByStockItemAndDate(rawByStockItemAndDate),
      contributions,
      incompleteDemandSources: [...incompleteDemandSources],
    };
  }
}

function identityOfEntry(entry: ConsumptionMappingEntry): string {
  return entry.type === "pizza" ? `pizza:${entry.pizza_id}:${entry.pizza_size}` : `stock:${entry.stock_item_id}`;
}

/** Constrói identidade → {title|reference}, escolhendo a primeira correspondência encontrada por fonte de procura. */
function buildReverseIndex(mappingsMap: Map<string, ConsumptionMappingEntry>): Map<string, { title?: string; reference?: string }> {
  const reverse = new Map<string, { title?: string; reference?: string }>();
  for (const [key, entry] of mappingsMap) {
    const identity = identityOfEntry(entry);
    if (reverse.has(identity)) continue;
    const separatorIndex = key.indexOf(":");
    const matchBy = key.slice(0, separatorIndex);
    const value = key.slice(separatorIndex + 1);
    reverse.set(identity, matchBy === "reference" ? { reference: value } : { title: value });
  }
  return reverse;
}

function mergeByStockItemAndDate(rows: StockConsumptionByDate[]): StockConsumptionByDate[] {
  const merged = new Map<string, StockConsumptionByDate>();
  for (const row of rows) {
    const key = `${row.stockItemId}:${row.date}`;
    const existing = merged.get(key);
    if (existing) {
      existing.expectedConsumption += row.expectedConsumption;
    } else {
      merged.set(key, { ...row });
    }
  }
  return [...merged.values()];
}
