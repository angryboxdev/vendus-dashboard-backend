import type { Router } from 'express';
import { VendusDeliveryGateway } from './adapters/out/vendus-delivery.gateway.js';
import { AirMenuKdsStoreAdapter } from './adapters/out/air-menu-kds-store.adapter.js';
import { GetPendingDeliveriesUseCase } from './application/use-cases/get-pending-deliveries.use-case.js';
import { UpdateDeliveryStatusUseCase } from './application/use-cases/update-delivery-status.use-case.js';
import { KdsController } from './adapters/in/kds.controller.js';
import { mapAirMenuEventToDelivery, mapAirMenuOrderToDelivery } from './adapters/out/air-menu-delivery.mapper.js';
import type { GetOrdersPort } from '../air-menu/domain/ports/in/get-orders.port.js';
import type { OrderEventBusPort } from '../air-menu/domain/ports/out/order-event-bus.port.js';

/** Janela de pedidos AirMenu recarregados ao arrancar (um serviço inteiro, incl. passagem da meia-noite). */
const REHYDRATE_WINDOW_MS = 12 * 60 * 60 * 1000;

export function createKdsModule(deps: {
  eventBus: OrderEventBusPort;
  /** Opcional: se presente, o store AirMenu é recarregado da API ao arrancar. */
  rehydrate?: { getOrders: GetOrdersPort; enterpriseId: string };
}): { router: Router } {
  const gateway = new VendusDeliveryGateway();
  const getDeliveries = new GetPendingDeliveriesUseCase(gateway);
  const updateStatus = new UpdateDeliveryStatusUseCase(gateway);
  const airMenuStore = new AirMenuKdsStoreAdapter();

  // Bridge: AirMenu webhook events → KDS in-memory store
  // Runs once at module level — all SSE clients share the same store
  deps.eventBus.subscribe((event) => {
    const delivery = mapAirMenuEventToDelivery(event);
    if (delivery) airMenuStore.addIfAbsent(delivery);
  });

  // O store vive em memória: após um restart/deploy perdia os pedidos do serviço em curso.
  // Recarrega-os em segundo plano (a API AirMenu tem limite de 2 s por pedido) — o que
  // chegar entretanto por webhook não é sobreposto (addIfAbsent).
  if (deps.rehydrate) {
    const { getOrders, enterpriseId } = deps.rehydrate;
    const end = new Date();
    const start = new Date(end.getTime() - REHYDRATE_WINDOW_MS);
    getOrders
      .execute(enterpriseId, start, end)
      .then((orders) => {
        let added = 0;
        for (const order of orders) {
          if (order.documentType !== 'invoice') continue;
          if (airMenuStore.addIfAbsent(mapAirMenuOrderToDelivery(order, enterpriseId))) added++;
        }
        console.log(`[KDS] Store AirMenu recarregado: ${added}/${orders.length} pedidos`);
      })
      .catch((e: unknown) => console.error(`[KDS] Falha ao recarregar pedidos AirMenu: ${String(e)}`));
  }

  const controller = new KdsController(getDeliveries, updateStatus, airMenuStore);
  return { router: controller.router };
}
