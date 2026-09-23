import type { GlovoEventBusPort } from "../../domain/ports/out/glovo-event-bus.port.js";
import type { GlovoEvent } from "../../domain/entities/glovo-event.js";

export class FakeGlovoEventBus implements GlovoEventBusPort {
  readonly events: GlovoEvent[] = [];

  publish(event: GlovoEvent): void {
    this.events.push(event);
  }

  subscribe(_handler: (event: GlovoEvent) => void): () => void {
    return () => {};
  }
}
