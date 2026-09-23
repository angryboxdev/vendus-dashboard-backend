import type { Router } from "express";
import type { GlovoEventBusPort } from "./domain/ports/out/glovo-event-bus.port.js";
import { InMemoryGlovoEventBus } from "./adapters/out/in-memory-glovo-event-bus.adapter.js";
import { HandleOrderDispatchedUseCase } from "./application/use-cases/handle-order-dispatched.use-case.js";
import { HandleOrderPickedUpUseCase } from "./application/use-cases/handle-order-picked-up.use-case.js";
import { HandleOrderCancelledUseCase } from "./application/use-cases/handle-order-cancelled.use-case.js";
import { GlovoController } from "./adapters/in/glovo.controller.js";

interface GlovoModuleOptions {
  /**
   * Token estático partilhado com a Glovo (enviado por eles no header
   * Authorization: Bearer <token> em todos os webhooks).
   * Se null, a verificação é ignorada — útil em stage/dev.
   */
  webhookToken: string | null;
}

export function createGlovoModule(options: GlovoModuleOptions): {
  publicRouter: Router;
  eventBus: GlovoEventBusPort;
} {
  const eventBus = new InMemoryGlovoEventBus();

  const handleOrderDispatched = new HandleOrderDispatchedUseCase(eventBus);
  const handleOrderPickedUp = new HandleOrderPickedUpUseCase(eventBus);
  const handleOrderCancelled = new HandleOrderCancelledUseCase(eventBus);

  const controller = new GlovoController(
    handleOrderDispatched,
    handleOrderPickedUp,
    handleOrderCancelled,
    options.webhookToken,
  );

  return { publicRouter: controller.publicRouter, eventBus };
}
