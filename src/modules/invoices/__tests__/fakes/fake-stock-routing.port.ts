import type { StockRoutingPort, StockRoutingView } from "../../domain/ports/out/stock-routing.port.js";

export class FakeStockRoutingPort implements StockRoutingPort {
  next: StockRoutingView = { send: null, source: "none", reason: "Sem predefinição", requiresDecision: false };
  calls: { supplierId: string | null; locationId: string | null; categoryIds: string[] }[] = [];
  async suggest(_o: unknown, input: { supplierId: string | null; locationId: string | null; categoryIds: string[] }) {
    this.calls.push(input);
    return this.next;
  }
}
