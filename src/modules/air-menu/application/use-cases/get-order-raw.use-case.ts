import type { GetOrderRawPort } from "../../domain/ports/in/get-order-raw.port.js";
import type { AirMenuGatewayPort } from "../../domain/ports/out/air-menu-gateway.port.js";
import type { SessionManagerService } from "../../domain/services/session-manager.service.js";

export class GetOrderRawUseCase implements GetOrderRawPort {
  constructor(
    private readonly sessionManager: SessionManagerService,
    private readonly gateway: AirMenuGatewayPort,
  ) {}

  async execute(enterpriseId: string, orderId: string): Promise<Record<string, unknown>[]> {
    const session = await this.sessionManager.getValidSession();
    const rawOrders = await this.gateway.getOrders(session.sessionId, enterpriseId, orderId);
    return Object.values(rawOrders).flat() as Record<string, unknown>[];
  }
}
