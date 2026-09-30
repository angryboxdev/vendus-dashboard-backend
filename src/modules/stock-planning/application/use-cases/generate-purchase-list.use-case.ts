import { NoLatestForecastRunError } from "../../domain/errors.js";
import type {
  GeneratePurchaseListCommand,
  GeneratePurchaseListPort,
  SuggestedPurchaseListDTO,
  SuggestedPurchaseListGroupDTO,
} from "../../domain/ports/in/stock-planning.ports.js";
import type { ForecastRunRepositoryPort } from "../../domain/ports/out/forecast-run-repository.port.js";
import type { StockItemPlanningReadPort } from "../../domain/ports/out/stock-item-planning-read.port.js";
import type { SupplierNameReadPort } from "../../domain/ports/out/supplier-name-read.port.js";

const NO_SUPPLIER_LABEL = "Sem fornecedor conhecido";

/**
 * Agrupada por fornecedor a partir das recomendações já gravadas do último
 * run — nunca gera um estado de "pedido" (secção 59); gerar 2x devolve a
 * mesma lista (as recomendações vêm sempre do mesmo run enquanto não correr
 * um novo, nunca duplicadas — secção 98).
 */
export class GeneratePurchaseListUseCase implements GeneratePurchaseListPort {
  constructor(
    private readonly forecastRunRepo: ForecastRunRepositoryPort,
    private readonly stockItemPlanningRead: StockItemPlanningReadPort,
    private readonly supplierNameRead: SupplierNameReadPort,
  ) {}

  async execute(command: GeneratePurchaseListCommand): Promise<SuggestedPurchaseListDTO> {
    const latestRun = await this.forecastRunRepo.findLatestRun(command.organizationId, command.locationId);
    if (!latestRun) throw new NoLatestForecastRunError(command.locationId);

    const recommendations = await this.forecastRunRepo.findRecommendations(command.organizationId, latestRun.id);
    const byId = new Map<string, SuggestedPurchaseListGroupDTO>();

    for (const rec of recommendations) {
      const item = await this.stockItemPlanningRead.findById(command.organizationId, rec.stockItemId);
      const groupKey = rec.supplierId ?? "__none__";
      let group = byId.get(groupKey);
      if (!group) {
        const supplierName = rec.supplierId ? ((await this.supplierNameRead.getName(command.organizationId, rec.supplierId)) ?? "Fornecedor") : NO_SUPPLIER_LABEL;
        group = { supplierId: rec.supplierId, supplierName, lines: [], totalEstimatedCost: null };
        byId.set(groupKey, group);
      }
      group.lines.push({
        recommendationId: rec.id,
        stockItemId: rec.stockItemId,
        itemName: item?.name ?? rec.stockItemId,
        suggestedBaseQty: rec.suggestedBaseQty,
        suggestedPurchaseQty: rec.suggestedPurchaseQty,
        purchaseUnit: rec.purchaseUnit,
        estimatedCost: rec.estimatedCost,
      });
      if (rec.estimatedCost != null) {
        group.totalEstimatedCost = (group.totalEstimatedCost ?? 0) + rec.estimatedCost;
      }
    }

    return {
      runId: latestRun.id,
      generatedAt: new Date().toISOString(),
      groups: [...byId.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName, "pt")),
    };
  }
}
