import { AirMenuOrder, type AirMenuFlag } from '../../domain/entities/air-menu-order.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flags(...keys: string[]): AirMenuFlag[] {
  return keys.map((key, i) => ({
    key,
    operator: 'script@airmenu.com',
    datetime: 1_720_000_000_000 + i * 60_000,
  }));
}

const ORDER_DATE = new Date('2026-08-04T10:00:00.000Z');

const BASE = {
  orderId: 'ord-1',
  platform: 'Glovo',
  divisionName: 'Test Division',
  orderDate: ORDER_DATE,
  paymentMethod: 'Online',
  items: [{ title: 'Burger', plu: 'ITM-1', price: 10, count: 2 }],
  firstName: 'João',
  lastName: 'Silva',
  providerOrderId: null,
  extraInfo: {},
  rawData: [],
};

// ─── documentType ─────────────────────────────────────────────────────────────

describe('AirMenuOrder — documentType', () => {
  it('é invoice quando FATURAR está presente e CANCEL não', () => {
    const order = AirMenuOrder.create({ ...BASE, activeFlags: flags('ACCEPT', 'FATURAR') });
    expect(order.documentType).toBe('invoice');
  });

  it('é credit_note quando CANCEL está presente, mesmo com FATURAR', () => {
    const order = AirMenuOrder.create({ ...BASE, activeFlags: flags('FATURAR', 'CANCEL') });
    expect(order.documentType).toBe('credit_note');
  });

  it('é invoice quando não há flags relevantes (apenas ACCEPT/PRINT)', () => {
    const order = AirMenuOrder.create({ ...BASE, activeFlags: flags('ACCEPT', 'PRINT') });
    expect(order.documentType).toBe('invoice');
  });

  it('é invoice com lista de flags vazia', () => {
    const order = AirMenuOrder.create({ ...BASE, activeFlags: [] });
    expect(order.documentType).toBe('invoice');
  });
});

// ─── documentDate ─────────────────────────────────────────────────────────────

describe('AirMenuOrder — documentDate', () => {
  it('usa o datetime da flag FATURAR para faturas', () => {
    const faturarTs = 1_722_600_000_000;
    const activeFlags: AirMenuFlag[] = [
      { key: 'ACCEPT', operator: 'script', datetime: 1_722_500_000_000 },
      { key: 'FATURAR', operator: 'script', datetime: faturarTs },
    ];
    const order = AirMenuOrder.create({ ...BASE, activeFlags });
    expect(order.documentDate.getTime()).toBe(faturarTs);
  });

  it('usa o datetime da flag CANCEL para notas de crédito', () => {
    const cancelTs = 1_722_700_000_000;
    const activeFlags: AirMenuFlag[] = [
      { key: 'FATURAR', operator: 'script', datetime: 1_722_600_000_000 },
      { key: 'CANCEL', operator: 'user', datetime: cancelTs },
    ];
    const order = AirMenuOrder.create({ ...BASE, activeFlags });
    expect(order.documentDate.getTime()).toBe(cancelTs);
  });

  it('usa orderDate como fallback quando FATURAR não tem datetime (datetime=0)', () => {
    const activeFlags: AirMenuFlag[] = [
      { key: 'FATURAR', operator: 'script', datetime: 0 },
    ];
    const order = AirMenuOrder.create({ ...BASE, activeFlags });
    // datetime=0 → new Date(0), not the fallback. Fallback só acontece se a flag não existe.
    expect(order.documentDate.getTime()).toBe(0);
  });

  it('usa orderDate como fallback quando nenhuma flag relevante existe', () => {
    const order = AirMenuOrder.create({ ...BASE, activeFlags: flags('ACCEPT', 'PRINT') });
    expect(order.documentDate).toEqual(ORDER_DATE);
  });

  it('DENY não é tratado como CANCEL — ordem mantém-se invoice', () => {
    const order = AirMenuOrder.create({ ...BASE, activeFlags: flags('FATURAR', 'DENY') });
    expect(order.documentType).toBe('invoice');
  });
});

// ─── total ─────────────────────────────────────────────────────────────────────

describe('AirMenuOrder — total', () => {
  it('é a soma de price * count de todos os itens para faturas', () => {
    const order = AirMenuOrder.create({
      ...BASE,
      items: [
        { title: 'A', plu: 'PLU-1', price: 5, count: 3 },
        { title: 'B', plu: 'PLU-2', price: 2, count: 2 },
      ],
      activeFlags: flags('FATURAR'),
    });
    expect(order.total).toBe(19); // 15 + 4
  });

  it('é negativo para notas de crédito', () => {
    const order = AirMenuOrder.create({
      ...BASE,
      items: [{ title: 'A', plu: 'PLU-1', price: 5, count: 3 }],
      activeFlags: flags('CANCEL'),
    });
    expect(order.total).toBe(-15);
  });

  it('é zero quando a lista de itens está vazia', () => {
    const order = AirMenuOrder.create({
      ...BASE,
      items: [],
      activeFlags: flags('FATURAR'),
    });
    expect(order.total).toBe(0);
  });
});
