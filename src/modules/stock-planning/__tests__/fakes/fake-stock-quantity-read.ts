import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { StockQuantityReadPort, StockQuantitySnapshot } from "../../domain/ports/out/stock-quantity-read.port.js";

export class FakeStockQuantityRead implements StockQuantityReadPort {
  quantities = new Map<string, StockQuantitySnapshot>();

  async getQuantities(_organizationId: OrganizationId, stockItemIds: string[]): Promise<Map<string, StockQuantitySnapshot>> {
    const out = new Map<string, StockQuantitySnapshot>();
    for (const id of stockItemIds) {
      out.set(id, this.quantities.get(id) ?? { stockItemId: id, currentQuantity: 0, lastPurchaseUnitCostWithoutVat: null });
    }
    return out;
  }
}
