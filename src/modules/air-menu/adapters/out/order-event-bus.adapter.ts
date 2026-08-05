import { EventEmitter } from "node:events";
import type {
  OrderEventBusPort,
  WebhookOrderEvent,
} from "../../domain/ports/out/order-event-bus.port.js";

const EVENT_NAME = "order";

export class OrderEventBusAdapter implements OrderEventBusPort {
  private readonly emitter = new EventEmitter();

  publish(event: WebhookOrderEvent): void {
    const subscribers = this.emitter.listenerCount(EVENT_NAME);
    console.log(`[AirMenu eventBus] publish enterprise=${event.enterpriseId} event=${event.event} subscribers=${subscribers}`);
    this.emitter.emit(EVENT_NAME, event);
  }

  subscribe(listener: (event: WebhookOrderEvent) => void): () => void {
    this.emitter.on(EVENT_NAME, listener);
    console.log(`[AirMenu eventBus] subscriber added total=${this.emitter.listenerCount(EVENT_NAME)}`);
    return () => {
      this.emitter.off(EVENT_NAME, listener);
      console.log(`[AirMenu eventBus] subscriber removed total=${this.emitter.listenerCount(EVENT_NAME)}`);
    };
  }
}
