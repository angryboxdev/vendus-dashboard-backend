import type { AirMenuDeliveryGatewayPort, DeliveryTotals } from "../../domain/ports/out/air-menu-delivery-gateway.port.js";

export class FakeAirMenuDeliveryGateway implements AirMenuDeliveryGatewayPort {
  private totalsByDate = new Map<string, DeliveryTotals>();
  shouldFail = false;

  setTotals(date: string, totals: DeliveryTotals): void {
    this.totalsByDate.set(date, totals);
  }

  async getDeliveryTotalsForDate(date: string): Promise<DeliveryTotals> {
    if (this.shouldFail) throw new Error("AirMenu API unavailable");
    return this.totalsByDate.get(date) ?? { uber: 0, glovo: 0, bolt: 0 };
  }
}
