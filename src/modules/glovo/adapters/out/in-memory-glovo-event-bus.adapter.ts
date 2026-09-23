import type { GlovoEventBusPort } from "../../domain/ports/out/glovo-event-bus.port.js";
import type { GlovoEvent } from "../../domain/entities/glovo-event.js";

export class InMemoryGlovoEventBus implements GlovoEventBusPort {
  private readonly handlers = new Set<(event: GlovoEvent) => void>();

  publish(event: GlovoEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (e) {
        console.error("[GlovoEventBus] handler error", e);
      }
    }
  }

  subscribe(handler: (event: GlovoEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
