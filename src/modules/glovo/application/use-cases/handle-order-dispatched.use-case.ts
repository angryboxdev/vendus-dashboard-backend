import type { HandleOrderDispatchedPort } from "../../domain/ports/in/handle-order-dispatched.port.js";
import type { GlovoEventBusPort } from "../../domain/ports/out/glovo-event-bus.port.js";
import type { GlovoOrder } from "../../domain/entities/glovo-order.js";

export class HandleOrderDispatchedUseCase implements HandleOrderDispatchedPort {
  constructor(private readonly eventBus: GlovoEventBusPort) {}

  async execute(order: GlovoOrder): Promise<void> {
    console.log(`[Glovo] ORDER_DISPATCHED order_id=${order.order_id} store_id=${order.store_id}`);
    this.eventBus.publish({ type: "ORDER_DISPATCHED", order, receivedAt: new Date() });
  }
}
