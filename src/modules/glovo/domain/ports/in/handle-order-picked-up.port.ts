import type { GlovoOrderPickedUp } from "../../entities/glovo-order-picked-up.js";

export interface HandleOrderPickedUpPort {
  execute(payload: GlovoOrderPickedUp): Promise<void>;
}
