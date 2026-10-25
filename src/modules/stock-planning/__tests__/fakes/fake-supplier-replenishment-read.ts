import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  SupplierItemPurchase,
  SupplierReplenishmentReadPort,
} from "../../domain/ports/out/supplier-replenishment-read.port.js";

export class FakeSupplierReplenishmentRead implements SupplierReplenishmentReadPort {
  purchasesBySupplier = new Map<string, SupplierItemPurchase[]>();
  consumption = new Map<string, number>();
  categories = new Map<string, string>();

  async lastPurchasesBySupplier(_organizationId: OrganizationId, supplierId: string): Promise<SupplierItemPurchase[]> {
    return this.purchasesBySupplier.get(supplierId) ?? [];
  }

  async consumptionLastDays(_organizationId: OrganizationId, stockItemIds: string[]): Promise<Map<string, number>> {
    return new Map(stockItemIds.filter((id) => this.consumption.has(id)).map((id) => [id, this.consumption.get(id)!]));
  }

  async categoryNames(_organizationId: OrganizationId, categoryIds: string[]): Promise<Map<string, string>> {
    return new Map(categoryIds.filter((id) => this.categories.has(id)).map((id) => [id, this.categories.get(id)!]));
  }
}
