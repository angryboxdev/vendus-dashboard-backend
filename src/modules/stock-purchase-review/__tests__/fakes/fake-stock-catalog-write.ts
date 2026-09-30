import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { CreateStockItemData, StockCatalogWritePort, StockItemSnapshot } from "../../domain/ports/out/stock-catalog-write.port.js";

export class FakeStockCatalogWrite implements StockCatalogWritePort {
  items = new Map<string, StockItemSnapshot>();

  seed(item: StockItemSnapshot): void {
    this.items.set(item.id, item);
  }

  async create(_organizationId: OrganizationId, data: CreateStockItemData): Promise<StockItemSnapshot> {
    const item: StockItemSnapshot = { id: randomUUID(), name: data.name, baseUnit: data.baseUnit, isActive: true };
    this.items.set(item.id, item);
    return item;
  }

  async findById(_organizationId: OrganizationId, id: string): Promise<StockItemSnapshot | null> {
    return this.items.get(id) ?? null;
  }
}
