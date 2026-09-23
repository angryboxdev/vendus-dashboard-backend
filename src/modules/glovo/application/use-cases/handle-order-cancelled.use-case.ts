import type { HandleOrderCancelledPort } from "../../domain/ports/in/handle-order-cancelled.port.js";
import type { GlovoEventBusPort } from "../../domain/ports/out/glovo-event-bus.port.js";
import type { GlovoOrderCancelled } from "../../domain/entities/glovo-order-cancelled.js";

export class HandleOrderCancelledUseCase implements HandleOrderCancelledPort {
  constructor(private readonly eventBus: GlovoEventBusPort) {}

  async execute(payload: GlovoOrderCancelled): Promise<void> {
    console.log(`[Glovo] ORDER_CANCELLED order_id=${payload.order_id} store_id=${payload.store_id} reason=${payload.cancellation_reason ?? "n/a"}`);
    this.eventBus.publish({ type: "ORDER_CANCELLED", payload, receivedAt: new Date() });
  }
}
