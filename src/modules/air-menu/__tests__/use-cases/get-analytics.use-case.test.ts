import { computeAnalytics } from '../../application/use-cases/get-analytics.use-case.js';
import { AirMenuOrder, type AirMenuFlag } from '../../domain/entities/air-menu-order.js';
import type { AirMenuMenuItem } from '../../domain/entities/air-menu-menu-item.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Datas em hora local para que isSingleDay() (que usa getDate()) funcione
// independentemente do fuso-horário do ambiente de teste.
const DAY_START = new Date(2026, 7, 4, 0, 0, 0, 0);   // 4 Ago 2026 00:00 local
const DAY_END   = new Date(2026, 7, 4, 23, 59, 59, 999); // 4 Ago 2026 23:59 local

const DOC_TS = new Date(2026, 7, 4, 12, 0, 0, 0).getTime(); // 4 Ago 2026 12:00 local

const EMPTY_CATALOG = new Map<string, AirMenuMenuItem>();

let _id = 0;
function uid() { return `ord-${++_id}`; }

function makeOrder(opts: {
  total: number;
  platform?: string;
  documentType?: 'invoice' | 'credit_note';
  plu?: string;
  docTs?: number;
}): AirMenuOrder {
  const { total, platform = 'Glovo', documentType = 'invoice', plu = 'PLU-1', docTs = DOC_TS } = opts;
  const activeFlags: AirMenuFlag[] =
    documentType === 'credit_note'
      ? [{ key: 'CANCEL', operator: 'user', datetime: docTs }]
      : [{ key: 'FATURAR', operator: 'script', datetime: docTs }];

  return AirMenuOrder.create({
    orderId: uid(),
    platform,
    divisionName: `${platform} division`,
    orderDate: new Date(docTs),
    paymentMethod: 'Online',
    items: [{ title: 'Item', plu, price: total, count: 1 }],
    firstName: '',
    lastName: '',
    activeFlags,
    providerOrderId: null,
    extraInfo: {},
    rawData: [],
  });
}

// ─── Empty orders ─────────────────────────────────────────────────────────────

describe('computeAnalytics — sem orders', () => {
  it('devolve zeros em todos os totais do summary', () => {
    const r = computeAnalytics([], EMPTY_CATALOG, DAY_START, DAY_END);
    expect(r.summary.totalOrders).toBe(0);
    expect(r.summary.totalCancellations).toBe(0);
    expect(r.summary.grossRevenue).toBe(0);
    expect(r.summary.vatCollected).toBe(0);
    expect(r.summary.netRevenue).toBe(0);
    expect(r.summary.averageTicket).toBe(0);
    expect(r.summary.cancellationRate).toBe(0);
  });

  it('pré-popula 24 buckets horários para um único dia', () => {
    const r = computeAnalytics([], EMPTY_CATALOG, DAY_START, DAY_END);
    expect(r.temporalDistribution).toHaveLength(24);
    expect(r.temporalDistribution[0].period).toBe('00:00');
    expect(r.temporalDistribution[23].period).toBe('23:00');
    expect(r.temporalDistribution.every((b) => b.orderCount === 0 && b.grossRevenue === 0)).toBe(true);
  });

  it('pré-popula N buckets diários para multi-dia', () => {
    const start = new Date(2026, 7, 1, 0, 0, 0, 0);    // 1 Ago local
    const end   = new Date(2026, 7, 3, 23, 59, 59, 999); // 3 Ago local
    const r = computeAnalytics([], EMPTY_CATALOG, start, end);
    expect(r.temporalDistribution).toHaveLength(3);
  });
});

// ─── Summary com faturas ──────────────────────────────────────────────────────

describe('computeAnalytics — summary com faturas', () => {
  it('conta totalOrders e acumula grossRevenue', () => {
    const r = computeAnalytics(
      [makeOrder({ total: 100 }), makeOrder({ total: 50 })],
      EMPTY_CATALOG, DAY_START, DAY_END,
    );
    expect(r.summary.totalOrders).toBe(2);
    expect(r.summary.grossRevenue).toBe(150);
  });

  it('averageTicket = grossRevenue / totalOrders (apenas faturas)', () => {
    const r = computeAnalytics(
      [makeOrder({ total: 60 }), makeOrder({ total: 40 })],
      EMPTY_CATALOG, DAY_START, DAY_END,
    );
    expect(r.summary.averageTicket).toBe(50);
  });
});

// ─── Summary com notas de crédito ─────────────────────────────────────────────

describe('computeAnalytics — notas de crédito', () => {
  it('incrementa totalCancellations e subtrai do grossRevenue', () => {
    const r = computeAnalytics(
      [makeOrder({ total: 100 }), makeOrder({ total: 30, documentType: 'credit_note' })],
      EMPTY_CATALOG, DAY_START, DAY_END,
    );
    expect(r.summary.totalCancellations).toBe(1);
    expect(r.summary.grossRevenue).toBe(70);
  });

  it('cancellationRate = cancelamentos / (faturas + cancelamentos) × 100', () => {
    const r = computeAnalytics(
      [makeOrder({ total: 100 }), makeOrder({ total: 100 }), makeOrder({ total: 50, documentType: 'credit_note' })],
      EMPTY_CATALOG, DAY_START, DAY_END,
    );
    // 1 / 3 ≈ 33.33
    expect(r.summary.cancellationRate).toBeCloseTo(33.33, 1);
  });

  it('averageTicket não inclui notas de crédito', () => {
    const r = computeAnalytics(
      [makeOrder({ total: 80 }), makeOrder({ total: 999, documentType: 'credit_note' })],
      EMPTY_CATALOG, DAY_START, DAY_END,
    );
    expect(r.summary.averageTicket).toBe(80);
  });
});

// ─── byDocumentType ────────────────────────────────────────────────────────────

describe('computeAnalytics — byDocumentType', () => {
  it('separa contagens e totais por tipo de documento', () => {
    const r = computeAnalytics(
      [makeOrder({ total: 80 }), makeOrder({ total: 40 }), makeOrder({ total: 20, documentType: 'credit_note' })],
      EMPTY_CATALOG, DAY_START, DAY_END,
    );
    expect(r.byDocumentType.invoices.count).toBe(2);
    expect(r.byDocumentType.invoices.grossRevenue).toBe(120);
    expect(r.byDocumentType.creditNotes.count).toBe(1);
    expect(r.byDocumentType.creditNotes.grossRevenue).toBe(20);
  });
});

// ─── byPlatform ────────────────────────────────────────────────────────────────

describe('computeAnalytics — byPlatform', () => {
  it('agrupa orders por plataforma com totais corretos', () => {
    const r = computeAnalytics(
      [makeOrder({ total: 100, platform: 'Glovo' }), makeOrder({ total: 50, platform: 'Glovo' }), makeOrder({ total: 200, platform: 'Uber Eats' })],
      EMPTY_CATALOG, DAY_START, DAY_END,
    );
    const glovo = r.byPlatform.find((p) => p.platform === 'Glovo')!;
    const uber  = r.byPlatform.find((p) => p.platform === 'Uber Eats')!;
    expect(glovo.grossRevenue).toBe(150);
    expect(glovo.orderCount).toBe(2);
    expect(uber.grossRevenue).toBe(200);
    expect(uber.orderCount).toBe(1);
  });

  it('cancellationCount é contado separadamente do orderCount', () => {
    const r = computeAnalytics(
      [makeOrder({ total: 100, platform: 'Glovo' }), makeOrder({ total: 30, platform: 'Glovo', documentType: 'credit_note' })],
      EMPTY_CATALOG, DAY_START, DAY_END,
    );
    const glovo = r.byPlatform.find((p) => p.platform === 'Glovo')!;
    expect(glovo.orderCount).toBe(1);
    expect(glovo.cancellationCount).toBe(1);
  });

  it('ordena por grossRevenue descendente', () => {
    const r = computeAnalytics(
      [makeOrder({ total: 50, platform: 'Glovo' }), makeOrder({ total: 200, platform: 'Uber Eats' })],
      EMPTY_CATALOG, DAY_START, DAY_END,
    );
    expect(r.byPlatform[0].platform).toBe('Uber Eats');
    expect(r.byPlatform[1].platform).toBe('Glovo');
  });

  it('averageTicket da plataforma = média das faturas dessa plataforma', () => {
    const r = computeAnalytics(
      [makeOrder({ total: 60, platform: 'Glovo' }), makeOrder({ total: 40, platform: 'Glovo' })],
      EMPTY_CATALOG, DAY_START, DAY_END,
    );
    const glovo = r.byPlatform.find((p) => p.platform === 'Glovo')!;
    expect(glovo.averageTicket).toBe(50);
  });
});

// ─── byVatRate ─────────────────────────────────────────────────────────────────

describe('computeAnalytics — byVatRate', () => {
  function makeCatalog(plu: string, vatRate: number): Map<string, AirMenuMenuItem> {
    return new Map([[plu, { plu, title: 'Item', category: 'Cat', parentCategory: 'Cat', vatRate }]]);
  }

  it('extrai IVA de 23% corretamente: gross=123 → vatAmount≈23, net≈100', () => {
    const r = computeAnalytics([makeOrder({ total: 123, plu: 'P1' })], makeCatalog('P1', 0.23), DAY_START, DAY_END);
    const vat = r.byVatRate.find((v) => v.rate === 23)!;
    expect(vat.vatAmount).toBeCloseTo(23, 1);
    expect(vat.netRevenue).toBeCloseTo(100, 1);
  });

  it('vatAmount é 0 para itens com IVA 0', () => {
    const r = computeAnalytics([makeOrder({ total: 100 })], EMPTY_CATALOG, DAY_START, DAY_END);
    const vat = r.byVatRate.find((v) => v.rate === 0)!;
    expect(vat.vatAmount).toBe(0);
    expect(vat.netRevenue).toBe(100);
  });

  it('ordena por taxa descendente (23 > 13 > 0)', () => {
    const catalog = new Map<string, AirMenuMenuItem>([
      ['P0',  { plu: 'P0',  title: 'A', category: 'C', parentCategory: 'C', vatRate: 0    }],
      ['P13', { plu: 'P13', title: 'B', category: 'C', parentCategory: 'C', vatRate: 0.13 }],
      ['P23', { plu: 'P23', title: 'C', category: 'C', parentCategory: 'C', vatRate: 0.23 }],
    ]);
    const orders = [
      makeOrder({ total: 100, plu: 'P0' }),
      makeOrder({ total: 100, plu: 'P13' }),
      makeOrder({ total: 100, plu: 'P23' }),
    ];
    const r = computeAnalytics(orders, catalog, DAY_START, DAY_END);
    expect(r.byVatRate[0].rate).toBe(23);
    expect(r.byVatRate[1].rate).toBe(13);
    expect(r.byVatRate[2].rate).toBe(0);
  });
});

// ─── topItems ─────────────────────────────────────────────────────────────────

describe('computeAnalytics — topItems', () => {
  it('ordena por grossRevenue descendente', () => {
    const o1 = AirMenuOrder.create({
      orderId: uid(), platform: 'Glovo', divisionName: 'div', orderDate: DAY_START,
      paymentMethod: '', items: [{ title: 'A', plu: 'PLU-A', price: 50, count: 1 }],
      firstName: '', lastName: '',
      activeFlags: [{ key: 'FATURAR', operator: '', datetime: DOC_TS }],
      providerOrderId: null, extraInfo: {}, rawData: [],
    });
    const o2 = AirMenuOrder.create({
      orderId: uid(), platform: 'Glovo', divisionName: 'div', orderDate: DAY_START,
      paymentMethod: '', items: [{ title: 'B', plu: 'PLU-B', price: 20, count: 1 }],
      firstName: '', lastName: '',
      activeFlags: [{ key: 'FATURAR', operator: '', datetime: DOC_TS }],
      providerOrderId: null, extraInfo: {}, rawData: [],
    });
    const r = computeAnalytics([o1, o2], EMPTY_CATALOG, DAY_START, DAY_END);
    expect(r.topItems[0].plu).toBe('PLU-A');
    expect(r.topItems[1].plu).toBe('PLU-B');
  });

  it('mesmo PLU com títulos diferentes são entradas distintas (tamanhos)', () => {
    const makeOrderWithItem = (title: string, price: number) =>
      AirMenuOrder.create({
        orderId: uid(), platform: 'Glovo', divisionName: 'div', orderDate: DAY_START,
        paymentMethod: '', items: [{ title, plu: 'PLU-1', price, count: 1 }],
        firstName: '', lastName: '',
        activeFlags: [{ key: 'FATURAR', operator: '', datetime: DOC_TS }],
        providerOrderId: null, extraInfo: {}, rawData: [],
      });
    const r = computeAnalytics(
      [makeOrderWithItem('Brigadeiro Normal', 8), makeOrderWithItem('Brigadeiro Grande', 11)],
      EMPTY_CATALOG, DAY_START, DAY_END,
    );
    expect(r.topItems).toHaveLength(2);
    expect(r.topItems.map((t) => t.title)).toEqual(
      expect.arrayContaining(['Brigadeiro Normal', 'Brigadeiro Grande']),
    );
  });

  it('agrega quantidades do mesmo PLU+título em orders diferentes', () => {
    const makeO = () =>
      AirMenuOrder.create({
        orderId: uid(), platform: 'Glovo', divisionName: 'div', orderDate: DAY_START,
        paymentMethod: '', items: [{ title: 'Burger', plu: 'PLU-1', price: 10, count: 2 }],
        firstName: '', lastName: '',
        activeFlags: [{ key: 'FATURAR', operator: '', datetime: DOC_TS }],
        providerOrderId: null, extraInfo: {}, rawData: [],
      });
    const r = computeAnalytics([makeO(), makeO()], EMPTY_CATALOG, DAY_START, DAY_END);
    expect(r.topItems).toHaveLength(1);
    expect(r.topItems[0].quantitySold).toBe(4);
    expect(r.topItems[0].grossRevenue).toBe(40);
  });
});

// ─── byCategory ───────────────────────────────────────────────────────────────

describe('computeAnalytics — byCategory', () => {
  it('agrupa itens por parentCategory e cria sub-categorias quando são diferentes', () => {
    const catalog = new Map<string, AirMenuMenuItem>([
      ['PLU-S', { plu: 'PLU-S', title: 'Especial', category: 'Specials', parentCategory: 'Pizzas', vatRate: 0 }],
    ]);
    const order = AirMenuOrder.create({
      orderId: uid(), platform: 'Glovo', divisionName: 'div', orderDate: DAY_START,
      paymentMethod: '', items: [{ title: 'Especial', plu: 'PLU-S', price: 20, count: 1 }],
      firstName: '', lastName: '',
      activeFlags: [{ key: 'FATURAR', operator: '', datetime: DOC_TS }],
      providerOrderId: null, extraInfo: {}, rawData: [],
    });
    const r = computeAnalytics([order], catalog, DAY_START, DAY_END);
    const cat = r.byCategory.find((c) => c.category === 'Pizzas')!;
    expect(cat.grossRevenue).toBe(20);
    expect(cat.subcategories).toHaveLength(1);
    expect(cat.subcategories[0].category).toBe('Specials');
  });

  it('não cria sub-categoria quando subcategory === parentCategory', () => {
    const catalog = new Map<string, AirMenuMenuItem>([
      ['PLU-B', { plu: 'PLU-B', title: 'Bebida', category: 'Bebidas', parentCategory: 'Bebidas', vatRate: 0.23 }],
    ]);
    const order = AirMenuOrder.create({
      orderId: uid(), platform: 'Glovo', divisionName: 'div', orderDate: DAY_START,
      paymentMethod: '', items: [{ title: 'Bebida', plu: 'PLU-B', price: 2, count: 1 }],
      firstName: '', lastName: '',
      activeFlags: [{ key: 'FATURAR', operator: '', datetime: DOC_TS }],
      providerOrderId: null, extraInfo: {}, rawData: [],
    });
    const r = computeAnalytics([order], catalog, DAY_START, DAY_END);
    const cat = r.byCategory.find((c) => c.category === 'Bebidas')!;
    expect(cat.subcategories).toHaveLength(0);
  });

  it('complemento sem PLU resolve categoria pelo título (strip "+")', () => {
    // Simula Coca-cola que vem como complemento de pizza: plu vazio, título com prefixo "+"
    const catalog = new Map<string, AirMenuMenuItem>([
      ['PLU-COKE', { plu: 'PLU-COKE', title: 'Coca-cola 33cl', category: 'Drinks', parentCategory: 'Drinks', vatRate: 0.23 }],
    ]);
    const order = AirMenuOrder.create({
      orderId: uid(), platform: 'Glovo', divisionName: 'div', orderDate: DAY_START,
      paymentMethod: '', items: [{ title: '+ Coca-cola 33cl', plu: '', price: 2.5, count: 1 }],
      firstName: '', lastName: '',
      activeFlags: [{ key: 'FATURAR', operator: '', datetime: DOC_TS }],
      providerOrderId: null, extraInfo: {}, rawData: [],
    });
    const r = computeAnalytics([order], catalog, DAY_START, DAY_END);
    const cat = r.byCategory.find((c) => c.category === 'Drinks')!;
    expect(cat).toBeDefined();
    expect(cat.grossRevenue).toBe(2.5);
    // IVA também resolvido pelo catálogo
    const vat = r.byVatRate.find((v) => v.rate === 23)!;
    expect(vat).toBeDefined();
    expect(vat.grossRevenue).toBe(2.5);
  });

  it('complemento sem PLU cai em "Outros" quando título não existe no catálogo', () => {
    const order = AirMenuOrder.create({
      orderId: uid(), platform: 'Glovo', divisionName: 'div', orderDate: DAY_START,
      paymentMethod: '', items: [{ title: '+ Desconto', plu: '', price: 0, count: 1 }],
      firstName: '', lastName: '',
      activeFlags: [{ key: 'FATURAR', operator: '', datetime: DOC_TS }],
      providerOrderId: null, extraInfo: {}, rawData: [],
    });
    const r = computeAnalytics([order], EMPTY_CATALOG, DAY_START, DAY_END);
    const outros = r.byCategory.find((c) => c.category === 'Outros')!;
    expect(outros).toBeDefined();
  });
});

// ─── topItems — merging complemento + standalone ───────────────────────────────

describe('computeAnalytics — topItems merging complemento + standalone', () => {
  it('mesmo produto standalone (com PLU) e como complemento (sem PLU) agrega numa única entrada', () => {
    const catalog = new Map<string, AirMenuMenuItem>([
      ['PLU-COKE', { plu: 'PLU-COKE', title: 'Coca-cola 33cl', category: 'Drinks', parentCategory: 'Drinks', vatRate: 0.23 }],
    ]);
    const standaloneOrder = AirMenuOrder.create({
      orderId: uid(), platform: 'Glovo', divisionName: 'div', orderDate: DAY_START,
      paymentMethod: '',
      items: [{ title: 'Coca-cola 33cl', plu: 'PLU-COKE', price: 2.5, count: 1 }],
      firstName: '', lastName: '',
      activeFlags: [{ key: 'FATURAR', operator: '', datetime: DOC_TS }],
      providerOrderId: null, extraInfo: {}, rawData: [],
    });
    const complementOrder = AirMenuOrder.create({
      orderId: uid(), platform: 'Glovo', divisionName: 'div', orderDate: DAY_START,
      paymentMethod: '',
      items: [{ title: '+ Coca-cola 33cl', plu: '', price: 2.5, count: 2 }],
      firstName: '', lastName: '',
      activeFlags: [{ key: 'FATURAR', operator: '', datetime: DOC_TS }],
      providerOrderId: null, extraInfo: {}, rawData: [],
    });
    const r = computeAnalytics([standaloneOrder, complementOrder], catalog, DAY_START, DAY_END);
    const cokeItems = r.topItems.filter((t) => t.title === 'Coca-cola 33cl');
    expect(cokeItems).toHaveLength(1);
    expect(cokeItems[0].quantitySold).toBe(3);   // 1 standalone + 2 complemento
    expect(cokeItems[0].grossRevenue).toBe(7.5);  // 2.5 + 5.0
    expect(cokeItems[0].plu).toBe('PLU-COKE');
  });
});
