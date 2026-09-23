import type { GlovoOrderCancelled } from "../../entities/glovo-order-cancelled.js";

export interface HandleOrderCancelledPort {
  execute(payload: GlovoOrderCancelled): Promise<void>;
}
