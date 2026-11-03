import { EventEmitter } from 'node:events';
import type { AirMenuKdsStorePort } from '../../domain/ports/out/air-menu-kds-store.port.js';
import type { Delivery, DeliveryStatus } from '../../domain/entities/delivery.js';

/** Pedidos com mais de 24 h saem da memória: o store não persiste e não pode crescer sem limite. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export class AirMenuKdsStoreAdapter implements AirMenuKdsStorePort {
  private readonly deliveries = new Map<number, Delivery>();
  private readonly emitter = new EventEmitter();

  constructor(private readonly now: () => number = Date.now) {}

  addIfAbsent(delivery: Delivery): boolean {
    this.evictExpired();
    if (this.deliveries.has(delivery.id)) return false;
    this.add(delivery);
    return true;
  }

  private evictExpired(): void {
    const limit = this.now() - MAX_AGE_MS;
    for (const [id, d] of this.deliveries) {
      const created = d.dateCreate ? Date.parse(d.dateCreate) : NaN;
      if (!Number.isNaN(created) && created < limit) this.deliveries.delete(id);
    }
  }

  add(delivery: Delivery): void {
    this.deliveries.set(delivery.id, delivery);
    this.emitter.emit('change', delivery);
  }

  updateStatus(id: number, status: DeliveryStatus): Delivery | null {
    const existing = this.deliveries.get(id);
    if (!existing) return null;
    const { deliveredAt: _prev, ...rest } = existing;
    const updated: Delivery = {
      ...rest,
      status,
      // Set deliveredAt when marked delivered; omit it (clear) when reverted
      ...(status === 'delivered' && { deliveredAt: Date.now() }),
    };
    this.deliveries.set(id, updated);
    this.emitter.emit('change', updated);
    return updated;
  }

  getAll(): Delivery[] {
    this.evictExpired();
    return Array.from(this.deliveries.values());
  }

  subscribe(listener: (delivery: Delivery) => void): () => void {
    this.emitter.on('change', listener);
    return () => this.emitter.off('change', listener);
  }
}
