import type { HandleOrderPickedUpPort } from "../../domain/ports/in/handle-order-picked-up.port.js";
import type { GlovoEventBusPort } from "../../domain/ports/out/glovo-event-bus.port.js";
import type { GlovoOrderPickedUp } from "../../domain/entities/glovo-order-picked-up.js";

export class HandleOrderPickedUpUseCase implements HandleOrderPickedUpPort {
  constructor(private readonly eventBus: GlovoEventBusPort) {}

  async execute(payload: GlovoOrderPickedUp): Promise<void> {
    console.log(`[Glovo] ORDER_PICKED_UP order_id=${payload.order_id} store_id=${payload.store_id}`);
    this.eventBus.publish({ type: "ORDER_PICKED_UP", payload, receivedAt: new Date() });
  }
}
