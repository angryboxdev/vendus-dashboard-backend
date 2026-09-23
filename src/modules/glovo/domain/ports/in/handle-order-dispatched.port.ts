import type { GlovoOrder } from "../../entities/glovo-order.js";

export interface HandleOrderDispatchedPort {
  execute(order: GlovoOrder): Promise<void>;
}
