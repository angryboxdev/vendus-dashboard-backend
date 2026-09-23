import type { GlovoEvent } from "../../entities/glovo-event.js";

export interface GlovoEventBusPort {
  publish(event: GlovoEvent): void;
  subscribe(handler: (event: GlovoEvent) => void): () => void;
}
