import type { Delivery, DeliveryStatus } from '../../entities/delivery.js';

export interface GetPendingDeliveriesPort {
  execute(): Promise<Delivery[]>;
}

export interface UpdateDeliveryStatusPort {
  execute(command: { id: number; status: DeliveryStatus }): Promise<void>;
}
