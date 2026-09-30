import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { StockCountSignalReadPort, StockCountSignalSnapshot } from "../../domain/ports/out/stock-count-signal-read.port.js";

export class FakeStockCountSignalRead implements StockCountSignalReadPort {
  signalsByItem = new Map<string, StockCountSignalSnapshot>();
  defaultSignal: StockCountSignalSnapshot = { lastCompletedCountAt: null, slowMovingDaysThreshold: null };

  async getSignalForItem(_organizationId: OrganizationId, stockItemId: string): Promise<StockCountSignalSnapshot> {
    return this.signalsByItem.get(stockItemId) ?? this.defaultSignal;
  }
}
