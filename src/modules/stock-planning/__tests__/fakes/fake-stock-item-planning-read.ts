import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { StockItemPlanningReadPort, StockItemPlanningSnapshot } from "../../domain/ports/out/stock-item-planning-read.port.js";

export class FakeStockItemPlanningRead implements StockItemPlanningReadPort {
  items: StockItemPlanningSnapshot[] = [];

  async listActive(_organizationId: OrganizationId): Promise<StockItemPlanningSnapshot[]> {
    return this.items.filter((i) => i.isActive);
  }

  async findById(_organizationId: OrganizationId, id: string): Promise<StockItemPlanningSnapshot | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }
}
