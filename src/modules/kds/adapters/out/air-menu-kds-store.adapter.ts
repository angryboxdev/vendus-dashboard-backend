import { EventEmitter } from 'node:events';
import type { AirMenuKdsStorePort } from '../../domain/ports/out/air-menu-kds-store.port.js';
import type { Delivery, DeliveryStatus } from '../../domain/entities/delivery.js';

export class AirMenuKdsStoreAdapter implements AirMenuKdsStorePort {
  private readonly deliveries = new Map<number, Delivery>();
  private readonly emitter = new EventEmitter();

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
    return Array.from(this.deliveries.values());
  }

  subscribe(listener: (delivery: Delivery) => void): () => void {
    this.emitter.on('change', listener);
    return () => this.emitter.off('change', listener);
  }
}
