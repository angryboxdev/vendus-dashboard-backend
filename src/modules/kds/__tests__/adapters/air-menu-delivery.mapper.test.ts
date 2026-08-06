import { mapAirMenuEventToDelivery } from '../../adapters/out/air-menu-delivery.mapper.js';
import type { WebhookOrderEvent } from '../../../air-menu/domain/ports/out/order-event-bus.port.js';

function makeEvent(overrides: Partial<WebhookOrderEvent> & { payload?: Record<string, unknown> } = {}): WebhookOrderEvent {
  return {
    enterpriseId: 'ent-1',
    event: 'CREATED',
    resource: 'ORDER',
    receivedAt: new Date('2026-01-15T10:00:00.000Z'),
    payload: {
      orderId: 42,
      simplifiedItems: [
        { name: 'Honey Pepperoni', quantity: 2, price: 12.5 },
        { name: 'Coca-Cola', quantity: 1, price: 2.0 },
      ],
      orders: {
        'Glovo Division': [
          {
            extraInfo: [{ AM_PROVIDER_ORDER_ID: 'GLV-9999' }],
          },
        ],
      },
    },
    ...overrides,
  };
}

describe('mapAirMenuEventToDelivery', () => {
  it('retorna null para eventos que não sejam CREATED', () => {
    expect(mapAirMenuEventToDelivery(makeEvent({ event: 'MODIFIED' }))).toBeNull();
    expect(mapAirMenuEventToDelivery(makeEvent({ event: 'DELETED' }))).toBeNull();
    expect(mapAirMenuEventToDelivery(makeEvent({ event: 'ACCEPTED' }))).toBeNull();
  });

  it('retorna null se orderId não for número', () => {
    const event = makeEvent({ payload: { orderId: 'abc', simplifiedItems: [], orders: {} } });
    expect(mapAirMenuEventToDelivery(event)).toBeNull();
  });

  it('mapeia campos base corretamente', () => {
    const delivery = mapAirMenuEventToDelivery(makeEvent());
    expect(delivery).not.toBeNull();
    expect(delivery!.id).toBe(42);
    expect(delivery!.reference).toBe(42);
    expect(delivery!.status).toBe('pending');
    expect(delivery!.type).toBe('delivery');
    expect(delivery!.dateCreate).toBe('2026-01-15T10:00:00.000Z');
  });

  describe('detecção de plataforma', () => {
    it('identifica Glovo pelo nome da division', () => {
      const delivery = mapAirMenuEventToDelivery(makeEvent());
      expect(delivery!.source).toBe('Glovo');
    });

    it('identifica Uber Eats', () => {
      const event = makeEvent({
        payload: {
          orderId: 1,
          simplifiedItems: [],
          orders: { 'Uber Eats Portugal': [] },
        },
      });
      expect(mapAirMenuEventToDelivery(event)!.source).toBe('Uber Eats');
    });

    it('identifica Bolt Food', () => {
      const event = makeEvent({
        payload: {
          orderId: 1,
          simplifiedItems: [],
          orders: { 'Bolt Food Delivery': [] },
        },
      });
      expect(mapAirMenuEventToDelivery(event)!.source).toBe('Bolt Food');
    });

    it('usa AirMenu como fallback', () => {
      const event = makeEvent({
        payload: {
          orderId: 1,
          simplifiedItems: [],
          orders: { 'Outra Plataforma': [] },
        },
      });
      expect(mapAirMenuEventToDelivery(event)!.source).toBe('AirMenu');
    });

    it('usa AirMenu quando orders está vazio', () => {
      const event = makeEvent({ payload: { orderId: 1, simplifiedItems: [], orders: {} } });
      expect(mapAirMenuEventToDelivery(event)!.source).toBe('AirMenu');
    });
  });

  describe('extração de providerOrderId', () => {
    it('extrai AM_PROVIDER_ORDER_ID de extraInfo como array', () => {
      const delivery = mapAirMenuEventToDelivery(makeEvent());
      const info = JSON.parse(delivery!.extraInfo) as { providerOrderId: string };
      expect(info.providerOrderId).toBe('GLV-9999');
    });

    it('extrai AM_PROVIDER_ORDER_ID de extraInfo como objeto único', () => {
      const event = makeEvent({
        payload: {
          orderId: 5,
          simplifiedItems: [],
          orders: {
            'Glovo Division': [
              { extraInfo: { AM_PROVIDER_ORDER_ID: 'GLV-1234' } },
            ],
          },
        },
      });
      const info = JSON.parse(mapAirMenuEventToDelivery(event)!.extraInfo) as { providerOrderId: string };
      expect(info.providerOrderId).toBe('GLV-1234');
    });

    it('retorna null se AM_PROVIDER_ORDER_ID não existir', () => {
      const event = makeEvent({
        payload: {
          orderId: 5,
          simplifiedItems: [],
          orders: { 'Glovo Division': [{ extraInfo: [{ OTHER_KEY: 'x' }] }] },
        },
      });
      const info = JSON.parse(mapAirMenuEventToDelivery(event)!.extraInfo) as { providerOrderId: null };
      expect(info.providerOrderId).toBeNull();
    });

    it('retorna null se a division não tiver instâncias', () => {
      const event = makeEvent({
        payload: { orderId: 5, simplifiedItems: [], orders: { 'Glovo Division': [] } },
      });
      const info = JSON.parse(mapAirMenuEventToDelivery(event)!.extraInfo) as { providerOrderId: null };
      expect(info.providerOrderId).toBeNull();
    });
  });

  describe('mapeamento de items — fallback simplifiedItems', () => {
    it('mapeia simplifiedItems para DeliveryItem[] quando orders não tem childs', () => {
      const delivery = mapAirMenuEventToDelivery(makeEvent());
      expect(delivery!.items).toHaveLength(2);
      expect(delivery!.items[0]).toMatchObject({ name: 'Honey Pepperoni', qty: 2, notes: '' });
      expect(delivery!.items[1]).toMatchObject({ name: 'Coca-Cola', qty: 1, notes: '' });
    });

    it('usa qty=1 quando quantity está ausente', () => {
      const event = makeEvent({
        payload: {
          orderId: 1,
          simplifiedItems: [{ name: 'Item sem qty' }],
          orders: {},
        },
      });
      expect(mapAirMenuEventToDelivery(event)!.items[0].qty).toBe(1);
    });

    it('usa nome vazio quando name está ausente', () => {
      const event = makeEvent({
        payload: { orderId: 1, simplifiedItems: [{ quantity: 1 }], orders: {} },
      });
      expect(mapAirMenuEventToDelivery(event)!.items[0].name).toBe('');
    });

    it('retorna lista vazia se simplifiedItems estiver ausente', () => {
      const event = makeEvent({ payload: { orderId: 1, orders: {} } });
      expect(mapAirMenuEventToDelivery(event)!.items).toHaveLength(0);
    });

    it('normaliza sufixo legado "- Grande" para L em simplifiedItems', () => {
      const event = makeEvent({
        payload: {
          orderId: 1,
          simplifiedItems: [{ name: '4 Formaggios - Grande', quantity: 1, price: 25.9 }],
          orders: {},
        },
      });
      expect(mapAirMenuEventToDelivery(event)!.items[0].name).toBe('4 Formaggios L');
    });

    it('normaliza sufixo legado "- Individual" para S em simplifiedItems', () => {
      const event = makeEvent({
        payload: {
          orderId: 1,
          simplifiedItems: [{ name: 'Tomate e Pesto - Individual', quantity: 1, price: 12 }],
          orders: {},
        },
      });
      expect(mapAirMenuEventToDelivery(event)!.items[0].name).toBe('Tomate e Pesto S');
    });
  });

  describe('mapeamento de items — estrutura nested orders', () => {
    function makeOrderInstance(childs: object[]): object {
      return {
        extraInfo: [{ AM_PROVIDER_ORDER_ID: 'GLV-9999' }],
        childs,
      };
    }

    function makeItem(title: string, price: number, childNodes: object[] = []): object {
      return { title, menuRelation: 'item', childs: childNodes, plu: 'PLU-1', price, count: 1 };
    }

    function makeComplement(title: string, items: object[]): object {
      return { title, menuRelation: 'complement', childs: items };
    }

    function makeComplementItem(title: string, price: number): object {
      return { title, menuRelation: 'complementItem', childs: [], price, count: 1 };
    }

    it('extrai items da estrutura nested quando childs estão presentes', () => {
      const event = makeEvent({
        payload: {
          orderId: 1,
          simplifiedItems: [],
          orders: {
            'Glovo Division': [
              makeOrderInstance([makeItem('Honey Pepperoni', 15.9)]),
            ],
          },
        },
      });
      const delivery = mapAirMenuEventToDelivery(event);
      expect(delivery!.items).toHaveLength(1);
      expect(delivery!.items[0].name).toBe('Honey Pepperoni');
    });

    it('identifica pizza como L via nested orders quando tem upgrade complement', () => {
      const upgradeComplement = makeComplement('Dobre a sua pizza 🍕', [
        makeComplementItem('Upgrade para L (20→25 cm)', 10),
      ]);
      const item = makeItem('Honey Pepperoni', 15.9, [upgradeComplement]);
      const event = makeEvent({
        payload: {
          orderId: 1,
          simplifiedItems: [],
          orders: { 'Glovo Division': [makeOrderInstance([item])] },
        },
      });
      const delivery = mapAirMenuEventToDelivery(event);
      expect(delivery!.items[0].name).toBe('Honey Pepperoni L');
    });

    it('identifica pizza como S via nested orders quando upgrade complement está ausente', () => {
      const upgradeComplement = makeComplement('Dobre a sua pizza 🍕', []);
      const item = makeItem('Chicken & Cheese', 15.9, [upgradeComplement]);
      const event = makeEvent({
        payload: {
          orderId: 1,
          simplifiedItems: [],
          orders: { 'Glovo Division': [makeOrderInstance([item])] },
        },
      });
      const delivery = mapAirMenuEventToDelivery(event);
      expect(delivery!.items[0].name).toBe('Chicken & Cheese S');
    });

    it('prefere nested orders em detrimento de simplifiedItems', () => {
      const item = makeItem('Honey Pepperoni', 15.9);
      const event = makeEvent({
        payload: {
          orderId: 1,
          // simplifiedItems teria o nome antigo/diferente
          simplifiedItems: [{ name: 'Honey Pepperoni - Grande', quantity: 1 }],
          orders: { 'Glovo Division': [makeOrderInstance([item])] },
        },
      });
      const delivery = mapAirMenuEventToDelivery(event);
      // nested orders vence — sem sufixo legado porque o título não tem "- Grande"
      expect(delivery!.items[0].name).toBe('Honey Pepperoni');
    });
  });
});
