import type { Router } from 'express';
import { VendusDeliveryGateway } from './adapters/out/vendus-delivery.gateway.js';
import { AirMenuKdsStoreAdapter } from './adapters/out/air-menu-kds-store.adapter.js';
import { GetPendingDeliveriesUseCase } from './application/use-cases/get-pending-deliveries.use-case.js';
import { UpdateDeliveryStatusUseCase } from './application/use-cases/update-delivery-status.use-case.js';
import { KdsController } from './adapters/in/kds.controller.js';
import { mapAirMenuEventToDelivery } from './adapters/out/air-menu-delivery.mapper.js';
import type { OrderEventBusPort } from '../air-menu/domain/ports/out/order-event-bus.port.js';

export function createKdsModule(deps: { eventBus: OrderEventBusPort }): { router: Router } {
  const gateway = new VendusDeliveryGateway();
  const getDeliveries = new GetPendingDeliveriesUseCase(gateway);
  const updateStatus = new UpdateDeliveryStatusUseCase(gateway);
  const airMenuStore = new AirMenuKdsStoreAdapter();

  // Bridge: AirMenu webhook events → KDS in-memory store
  // Runs once at module level — all SSE clients share the same store
  deps.eventBus.subscribe((event) => {
    const delivery = mapAirMenuEventToDelivery(event);
    if (delivery) airMenuStore.add(delivery);
  });

  const controller = new KdsController(getDeliveries, updateStatus, airMenuStore);
  return { router: controller.router };
}
