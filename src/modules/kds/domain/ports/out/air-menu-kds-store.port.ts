import type { Delivery, DeliveryStatus } from '../../entities/delivery.js';

export interface AirMenuKdsStorePort {
  add(delivery: Delivery): void;
  /** Returns the updated delivery, or null if not found. */
  updateStatus(id: number, status: DeliveryStatus): Delivery | null;
  getAll(): Delivery[];
  /** Subscribe to any change (add or status update). Returns unsubscribe fn. */
  subscribe(listener: (delivery: Delivery) => void): () => void;
}
