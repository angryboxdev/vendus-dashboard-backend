import type { UpdateDeliveryStatusPort } from '../../domain/ports/in/kds.ports.js';
import type { DeliveryGatewayPort } from '../../domain/ports/out/delivery-gateway.port.js';
import type { DeliveryStatus } from '../../domain/entities/delivery.js';

export class UpdateDeliveryStatusUseCase implements UpdateDeliveryStatusPort {
  constructor(private readonly gateway: DeliveryGatewayPort) {}

  execute(command: { id: number; status: DeliveryStatus }): Promise<void> {
    return this.gateway.updateStatus(command.id, command.status);
  }
}
