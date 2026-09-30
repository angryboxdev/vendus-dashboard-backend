import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { ENV } from "../../../../config/env.js";
import { buildMonthlySummary } from "../../../../services/monthlySummaryService.js";
import { fetchAllDocuments } from "../../../../services/documentsService.js";
import { getAllConsumptionMappingsMap, type ConsumptionMappingEntry } from "../../../../services/vendusMappingService.js";
import type { DemandActualRow } from "../../domain/ports/out/demand-actuals-repository.port.js";
import type { VendusSalesReadPort } from "../../domain/ports/out/vendus-sales-read.port.js";
import type { DemandSourceType } from "../../domain/services/impact-simulation.service.js";

function identityOfEntry(entry: ConsumptionMappingEntry): { type: DemandSourceType; ref: string } {
  return entry.type === "pizza"
    ? { type: "pizza", ref: `${entry.pizza_id}:${entry.pizza_size}` }
    : { type: "stock", ref: entry.stock_item_id };
}

/**
 * Reaproveita `buildMonthlySummary`/`fetchAllDocuments`
 * (`src/services/monthlySummaryService.ts`/`documentsService.ts`) — mesmo
 * modelo de leitura que `ingredientConsumptionService.ts` já usa. Exceção
 * deliberada e documentada à regra "nunca importar serviço legacy" (ver
 * README). Autoconsumo Vendus fica fora desta cache nesta ronda (só
 * `FS`/`FT`/`NC` reais) — gap conhecido, documentado no README, não
 * fabricado.
 */
export class LegacyVendusSalesReadAdapter implements VendusSalesReadPort {
  async fetchDailyActuals(organizationId: OrganizationId, _locationId: string, date: string): Promise<DemandActualRow[]> {
    const summary = await buildMonthlySummary({
      since: date,
      until: date,
      type: "FS,FT,NC",
      perPage: ENV.PER_PAGE_DEFAULT,
      concurrency: ENV.CONCURRENCY,
      fetchAllDocuments,
    });

    const products = summary.products_overall ?? [];
    const mappings = await getAllConsumptionMappingsMap(organizationId);
    const byDemandSource = new Map<string, number>();

    for (const product of products) {
      const mappingByRef = product.reference ? mappings.get(`reference:${product.reference}`) : undefined;
      const mapping = mappingByRef ?? mappings.get(`title:${product.title}`);
      if (!mapping) continue; // sem mapeamento — sinalizado como "previsão incompleta" mais tarde no pipeline, nunca inventado aqui.

      const { type, ref } = identityOfEntry(mapping);
      const key = `${type}:${ref}`;
      byDemandSource.set(key, (byDemandSource.get(key) ?? 0) + product.qty);
    }

    return [...byDemandSource.entries()].map(([key, quantitySold]) => {
      const separatorIndex = key.indexOf(":");
      return {
        demandSourceType: key.slice(0, separatorIndex) as DemandSourceType,
        demandSourceRef: key.slice(separatorIndex + 1),
        saleDate: date,
        quantitySold,
      };
    });
  }
}
