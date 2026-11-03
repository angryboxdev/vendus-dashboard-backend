import type { Delivery, DeliveryStatus } from '../../entities/delivery.js';

export interface AirMenuKdsStorePort {
  add(delivery: Delivery): void;
  /**
   * Adds the delivery only if its id is not already known (idempotent). Used for
   * webhook CREATED events — which AirMenu may resend — and for re-hydration after a
   * restart, so neither can reset the status the kitchen already gave an order.
   * Returns true when the delivery was added.
   */
  addIfAbsent(delivery: Delivery): boolean;
  /** Returns the updated delivery, or null if not found. */
  updateStatus(id: number, status: DeliveryStatus): Delivery | null;
  getAll(): Delivery[];
  /** Subscribe to any change (add or status update). Returns unsubscribe fn. */
  subscribe(listener: (delivery: Delivery) => void): () => void;
}
