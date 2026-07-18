import type { GetPendingDeliveriesPort } from '../../domain/ports/in/kds.ports.js';
import type { DeliveryGatewayPort } from '../../domain/ports/out/delivery-gateway.port.js';
import type { Delivery } from '../../domain/entities/delivery.js';

export class GetPendingDeliveriesUseCase implements GetPendingDeliveriesPort {
  constructor(private readonly gateway: DeliveryGatewayPort) {}

  execute(): Promise<Delivery[]> {
    return this.gateway.getActive();
  }
}
