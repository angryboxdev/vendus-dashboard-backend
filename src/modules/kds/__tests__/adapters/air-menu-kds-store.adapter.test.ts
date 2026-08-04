import { AirMenuKdsStoreAdapter } from '../../adapters/out/air-menu-kds-store.adapter.js';
import type { Delivery } from '../../domain/entities/delivery.js';

function makeDelivery(overrides: Partial<Delivery> = {}): Delivery {
  return {
    id: 1,
    reference: 1,
    type: 'delivery',
    status: 'pending',
    source: 'Glovo',
    kitchenId: 0,
    tableId: 0,
    table: null,
    items: [],
    extraInfo: '{}',
    dateCreate: '2026-01-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('AirMenuKdsStoreAdapter', () => {
  describe('add / getAll', () => {
    it('adiciona uma delivery e retorna-a no getAll', () => {
      const store = new AirMenuKdsStoreAdapter();
      store.add(makeDelivery({ id: 1 }));
      expect(store.getAll()).toHaveLength(1);
      expect(store.getAll()[0].id).toBe(1);
    });

    it('upsert: adicionar a mesma id substitui a anterior', () => {
      const store = new AirMenuKdsStoreAdapter();
      store.add(makeDelivery({ id: 1, status: 'pending' }));
      store.add(makeDelivery({ id: 1, status: 'cooking' }));
      const all = store.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].status).toBe('cooking');
    });

    it('emite evento de change ao adicionar', () => {
      const store = new AirMenuKdsStoreAdapter();
      const received: Delivery[] = [];
      store.subscribe((d) => received.push(d));
      store.add(makeDelivery({ id: 1 }));
      expect(received).toHaveLength(1);
      expect(received[0].id).toBe(1);
    });
  });

  describe('updateStatus', () => {
    it('retorna null se a delivery não existir', () => {
      const store = new AirMenuKdsStoreAdapter();
      expect(store.updateStatus(999, 'cooking')).toBeNull();
    });

    it('actualiza o status da delivery', () => {
      const store = new AirMenuKdsStoreAdapter();
      store.add(makeDelivery({ id: 1, status: 'pending' }));
      const updated = store.updateStatus(1, 'cooking');
      expect(updated!.status).toBe('cooking');
      expect(store.getAll()[0].status).toBe('cooking');
    });

    it('define deliveredAt quando status passa a delivered', () => {
      const store = new AirMenuKdsStoreAdapter();
      store.add(makeDelivery({ id: 1, status: 'waiting_to_delivery' }));
      const before = Date.now();
      const updated = store.updateStatus(1, 'delivered');
      const after = Date.now();
      expect(updated!.deliveredAt).toBeGreaterThanOrEqual(before);
      expect(updated!.deliveredAt).toBeLessThanOrEqual(after);
    });

    it('limpa deliveredAt quando status é revertido de delivered', () => {
      const store = new AirMenuKdsStoreAdapter();
      store.add(makeDelivery({ id: 1, status: 'waiting_to_delivery' }));
      store.updateStatus(1, 'delivered');
      const reverted = store.updateStatus(1, 'waiting_to_delivery');
      expect(reverted!.deliveredAt).toBeUndefined();
    });

    it('não define deliveredAt para outros estados', () => {
      const store = new AirMenuKdsStoreAdapter();
      store.add(makeDelivery({ id: 1, status: 'pending' }));
      const updated = store.updateStatus(1, 'cooking');
      expect(updated!.deliveredAt).toBeUndefined();
    });

    it('emite evento de change ao actualizar', () => {
      const store = new AirMenuKdsStoreAdapter();
      store.add(makeDelivery({ id: 1, status: 'pending' }));
      const received: Delivery[] = [];
      store.subscribe((d) => received.push(d));
      store.updateStatus(1, 'cooking');
      expect(received).toHaveLength(1);
      expect(received[0].status).toBe('cooking');
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('deixa de receber eventos após unsubscribe', () => {
      const store = new AirMenuKdsStoreAdapter();
      const received: Delivery[] = [];
      const unsubscribe = store.subscribe((d) => received.push(d));
      store.add(makeDelivery({ id: 1 }));
      unsubscribe();
      store.add(makeDelivery({ id: 2 }));
      expect(received).toHaveLength(1); // só o primeiro
    });

    it('suporta múltiplos subscribers independentes', () => {
      const store = new AirMenuKdsStoreAdapter();
      const a: number[] = [];
      const b: number[] = [];
      store.subscribe((d) => a.push(d.id));
      store.subscribe((d) => b.push(d.id));
      store.add(makeDelivery({ id: 10 }));
      expect(a).toEqual([10]);
      expect(b).toEqual([10]);
    });
  });
});
