import type { GlovoOrder } from "./glovo-order.js";
import type { GlovoOrderPickedUp } from "./glovo-order-picked-up.js";
import type { GlovoOrderCancelled } from "./glovo-order-cancelled.js";

export interface GlovoDispatchedEvent {
  type: "ORDER_DISPATCHED";
  order: GlovoOrder;
  receivedAt: Date;
}

export interface GlovoPickedUpEvent {
  type: "ORDER_PICKED_UP";
  payload: GlovoOrderPickedUp;
  receivedAt: Date;
}

export interface GlovoCancelledEvent {
  type: "ORDER_CANCELLED";
  payload: GlovoOrderCancelled;
  receivedAt: Date;
}

export type GlovoEvent = GlovoDispatchedEvent | GlovoPickedUpEvent | GlovoCancelledEvent;
