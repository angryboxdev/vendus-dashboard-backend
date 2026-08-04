import type { GetAirMenuTotalsPort } from "../../domain/ports/in/get-airmenu-totals.port.js";
import type { AirMenuDeliveryGatewayPort, DeliveryTotals } from "../../domain/ports/out/air-menu-delivery-gateway.port.js";

export class GetAirMenuTotalsUseCase implements GetAirMenuTotalsPort {
  constructor(private readonly airMenuGateway?: AirMenuDeliveryGatewayPort) {}

  async execute(date: string): Promise<DeliveryTotals | null> {
    if (!this.airMenuGateway) return null;
    try {
      return await this.airMenuGateway.getDeliveryTotalsForDate(date);
    } catch {
      return null;
    }
  }
}
