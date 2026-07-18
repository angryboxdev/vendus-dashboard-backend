import type { Delivery, DeliveryStatus } from '../../entities/delivery.js';

export interface DeliveryGatewayPort {
  getActive(): Promise<Delivery[]>;
  updateStatus(id: number, status: DeliveryStatus): Promise<void>;
}
