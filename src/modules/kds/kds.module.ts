import type { Router } from 'express';
import { VendusDeliveryGateway } from './adapters/out/vendus-delivery.gateway.js';
import { GetPendingDeliveriesUseCase } from './application/use-cases/get-pending-deliveries.use-case.js';
import { UpdateDeliveryStatusUseCase } from './application/use-cases/update-delivery-status.use-case.js';
import { KdsController } from './adapters/in/kds.controller.js';

export function createKdsModule(): { router: Router } {
  const gateway = new VendusDeliveryGateway();
  const getDeliveries = new GetPendingDeliveriesUseCase(gateway);
  const updateStatus = new UpdateDeliveryStatusUseCase(gateway);
  const controller = new KdsController(getDeliveries, updateStatus);
  return { router: controller.router };
}
