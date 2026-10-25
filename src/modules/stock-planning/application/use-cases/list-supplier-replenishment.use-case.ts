import type {
  ListSupplierReplenishmentCommand,
  ListSupplierReplenishmentPort,
  SupplierReplenishmentRowDTO,
} from "../../domain/ports/in/stock-planning.ports.js";
import type { ForecastRunRepositoryPort } from "../../domain/ports/out/forecast-run-repository.port.js";
import type { StockItemPlanningReadPort } from "../../domain/ports/out/stock-item-planning-read.port.js";
import type { StockQuantityReadPort } from "../../domain/ports/out/stock-quantity-read.port.js";
import type { SupplierReplenishmentReadPort } from "../../domain/ports/out/supplier-replenishment-read.port.js";
import { buildReplenishmentRows } from "../../domain/services/supplier-replenishment.service.js";

const CONSUMPTION_DAYS = 30;

/**
 * Artigos «deste fornecedor» = os que o Planeamento lhe atribui na última
 * recomendação da loja + os que já lhe foram comprados (linhas de faturas
 * ligadas a stock). Stock atual e consumo são da organização, como no ecrã
 * de Planeamento; só a sugestão depende da loja (run de previsão).
 */
export class ListSupplierReplenishmentUseCase implements ListSupplierReplenishmentPort {
  constructor(
    private readonly stockItemPlanningRead: StockItemPlanningReadPort,
    private readonly stockQuantityRead: StockQuantityReadPort,
    private readonly forecastRunRepo: ForecastRunRepositoryPort,
    private readonly replenishmentRead: SupplierReplenishmentReadPort,
  ) {}

  async execute(command: ListSupplierReplenishmentCommand): Promise<SupplierReplenishmentRowDTO[]> {
    const { organizationId, supplierId, locationId } = command;

    const [items, purchases, latestRun] = await Promise.all([
      this.stockItemPlanningRead.listActive(organizationId),
      this.replenishmentRead.lastPurchasesBySupplier(organizationId, supplierId),
      this.forecastRunRepo.findLatestRun(organizationId, locationId),
    ]);
    const recommendations = latestRun ? await this.forecastRunRepo.findRecommendations(organizationId, latestRun.id) : [];

    const purchaseByItem = new Map(purchases.map((p) => [p.stockItemId, p]));
    const recByItem = new Map(recommendations.map((r) => [r.stockItemId, r]));
    const supplierItems = items.filter(
      (i) => purchaseByItem.has(i.id) || recByItem.get(i.id)?.supplierId === supplierId,
    );
    if (supplierItems.length === 0) return [];

    const ids = supplierItems.map((i) => i.id);
    const [quantities, consumption, categories] = await Promise.all([
      this.stockQuantityRead.getQuantities(organizationId, ids),
      this.replenishmentRead.consumptionLastDays(organizationId, ids, CONSUMPTION_DAYS),
      this.replenishmentRead.categoryNames(organizationId, [...new Set(supplierItems.map((i) => i.categoryId))]),
    ]);

    return buildReplenishmentRows(
      supplierItems.map((item) => {
        const rec = recByItem.get(item.id);
        const purchase = purchaseByItem.get(item.id);
        return {
          stockItemId: item.id,
          name: item.name,
          categoryName: categories.get(item.categoryId) ?? null,
          baseUnit: item.baseUnit,
          currentQuantity: quantities.get(item.id)?.currentQuantity ?? 0,
          minStockQty: item.minStockQty,
          consumption30d: consumption.get(item.id) ?? 0,
          // Recomendação de outro fornecedor não conta como sugestão deste.
          recommendation: rec && (rec.supplierId === supplierId || rec.supplierId === null) ? rec : null,
          lastPurchase: purchase
            ? {
                date: purchase.lastPurchaseDate,
                unitCostWithoutVat: purchase.lastUnitCostWithoutVat,
                supplierItemCode: purchase.supplierItemCode,
                purchaseUnit: purchase.purchaseUnit,
              }
            : null,
        };
      }),
    );
  }
}
