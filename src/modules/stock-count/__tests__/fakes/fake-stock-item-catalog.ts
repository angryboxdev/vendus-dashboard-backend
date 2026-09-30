import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  CreateStockItemForCountData,
  StockItemCatalogPort,
  StockItemForCountSnapshot,
  StockItemScopeFilter,
} from "../../domain/ports/out/stock-item-catalog.port.js";

export class FakeStockItemCatalog implements StockItemCatalogPort {
  items = new Map<string, StockItemForCountSnapshot>();

  seed(item: StockItemForCountSnapshot): void {
    this.items.set(item.id, item);
  }

  async listEligibleForScope(_organizationId: OrganizationId, filter: StockItemScopeFilter): Promise<StockItemForCountSnapshot[]> {
    return [...this.items.values()].filter((item) => {
      if (!item.isActive || !item.stockTrackingEnabled) return false;
      if (filter.categoryIds && filter.categoryIds.length > 0 && filter.categoryIds.includes(item.categoryId)) return true;
      if (filter.itemIds && filter.itemIds.length > 0 && filter.itemIds.includes(item.id)) return true;
      if ((!filter.categoryIds || filter.categoryIds.length === 0) && (!filter.itemIds || filter.itemIds.length === 0)) return true;
      return false;
    });
  }

  async findById(_organizationId: OrganizationId, id: string): Promise<StockItemForCountSnapshot | null> {
    return this.items.get(id) ?? null;
  }

  async create(_organizationId: OrganizationId, data: CreateStockItemForCountData): Promise<StockItemForCountSnapshot> {
    const item: StockItemForCountSnapshot = {
      id: randomUUID(),
      name: data.name,
      categoryId: data.categoryId,
      baseUnit: data.baseUnit,
      isActive: true,
      stockTrackingEnabled: true,
      tolerance: null,
      purchaseReferenceUnitCostWithoutVat: null,
      alternateUnits: [],
    };
    this.items.set(item.id, item);
    return item;
  }
}
