import { EventEmitter } from "node:events";
import type {
  OrderEventBusPort,
  WebhookOrderEvent,
} from "../../domain/ports/out/order-event-bus.port.js";

const EVENT_NAME = "order";

export class OrderEventBusAdapter implements OrderEventBusPort {
  private readonly emitter = new EventEmitter();

  publish(event: WebhookOrderEvent): void {
    this.emitter.emit(EVENT_NAME, event);
  }

  subscribe(listener: (event: WebhookOrderEvent) => void): () => void {
    this.emitter.on(EVENT_NAME, listener);
    return () => this.emitter.off(EVENT_NAME, listener);
  }
}
