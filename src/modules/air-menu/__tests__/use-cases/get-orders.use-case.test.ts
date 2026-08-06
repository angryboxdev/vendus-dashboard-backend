import { GetOrdersUseCase } from '../../application/use-cases/get-orders.use-case.js';
import { AirMenuSession } from '../../domain/entities/air-menu-session.js';
import type { AirMenuGatewayPort, RawOrderItemInstance } from '../../domain/ports/out/air-menu-gateway.port.js';
import type { SessionManagerService } from '../../domain/services/session-manager.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ENT_ID = 'ent-1';
const START  = new Date('2026-08-04T00:00:00.000Z');
const END    = new Date('2026-08-04T23:59:59.999Z');

/** Timestamp de um FATURAR dentro do range (meio-dia). */
const FATURAR_TS = new Date('2026-08-04T12:00:00.000Z').getTime();
const FATURAR_FLAG = { key: 'FATURAR', operator: 'script', datetime: FATURAR_TS };

/**
 * Cria um RawOrderItemInstance que representa o container de uma ordem
 * (nível de divisão). Os itens reais ficam em `childs`.
 */
function makeOrderInstance(
  orderId: string,
  childs: RawOrderItemInstance[],
  overrides: Partial<RawOrderItemInstance> = {},
): RawOrderItemInstance {
  return {
    title: 'Order',
    menuRelation: 'order',
    childs,
    orderId,
    orderDate: START.getTime(),
    paymentMethod: 'Online',
    firstName: 'Ana',
    lastName: 'Costa',
    activeFlags: [FATURAR_FLAG],
    extraInfo: {},
    ...overrides,
  };
}

/** Cria um RawOrderItemInstance do tipo item (produto). */
function makeItemChild(overrides: Partial<RawOrderItemInstance> = {}): RawOrderItemInstance {
  return {
    title: 'Produto',
    menuRelation: 'item',
    childs: [],
    plu: 'PLU-1',
    price: 10,
    count: 1,
    ...overrides,
  };
}

/** Cria um nó de complemento (grupo de opções). */
function makeComplement(title: string, items: RawOrderItemInstance[]): RawOrderItemInstance {
  return {
    title,
    menuRelation: 'complement',
    childs: items,
  };
}

/** Cria um nó de complementItem (opção seleccionada). */
function makeComplementItem(title: string, price = 0, plu = ''): RawOrderItemInstance {
  return {
    title,
    menuRelation: 'complementItem',
    childs: [],
    price,
    plu,
    count: 1,
  };
}

/**
 * Monta os stubs a partir de um mapa orderId → divisão → instâncias.
 */
function makeStubs(rawMap: Record<string, Record<string, RawOrderItemInstance[]>>) {
  const session = AirMenuSession.create('sess-test', []);
  const sessionManager = {
    getValidSession: async () => session,
  } as unknown as SessionManagerService;

  const orderIds = Object.keys(rawMap);
  const gateway: Pick<AirMenuGatewayPort, 'getOrderIds' | 'getOrders'> = {
    getOrderIds: async () => orderIds,
    getOrders: async (_sid, _eid, orderId) => rawMap[orderId] ?? {},
  };

  return new GetOrdersUseCase(sessionManager, gateway as AirMenuGatewayPort);
}

// ─── derivação de plataforma ──────────────────────────────────────────────────

describe('GetOrdersUseCase — derivação de plataforma', () => {
  it('detecta Glovo pelo nome da divisão', async () => {
    const uc = makeStubs({
      'ord-1': { 'Store #|# Angry Box #|# Glovo': [makeOrderInstance('ord-1', [makeItemChild()])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders[0].platform).toBe('Glovo');
  });

  it('detecta Uber Eats pelo nome da divisão', async () => {
    const uc = makeStubs({
      'ord-1': { 'Store #|# Angry Box #|# Uber Eats': [makeOrderInstance('ord-1', [makeItemChild()])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders[0].platform).toBe('Uber Eats');
  });

  it('detecta Bolt Food pelo nome da divisão', async () => {
    const uc = makeStubs({
      'ord-1': { 'Store #|# Angry Box #|# Bolt Food': [makeOrderInstance('ord-1', [makeItemChild()])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders[0].platform).toBe('Bolt Food');
  });

  it('usa o nome da divisão como fallback para plataformas desconhecidas', async () => {
    const uc = makeStubs({
      'ord-1': { 'Divisão Desconhecida': [makeOrderInstance('ord-1', [makeItemChild()])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders[0].platform).toBe('Divisão Desconhecida');
  });
});

// ─── extracção de itens — item simples ────────────────────────────────────────

describe('GetOrdersUseCase — extracção de itens simples', () => {
  it('extrai plu, preço e quantidade do item', async () => {
    const item = makeItemChild({ title: 'Burger', plu: 'PLU-99', price: 12.5, count: 2 });
    const uc = makeStubs({
      'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [item])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    const [extracted] = orders[0].items;
    expect(extracted.title).toBe('Burger');
    expect(extracted.plu).toBe('PLU-99');
    expect(extracted.price).toBe(12.5);
    expect(extracted.count).toBe(2);
  });

  it('devolve lista vazia de itens quando não há childs', async () => {
    const uc = makeStubs({
      'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders[0].items).toHaveLength(0);
  });
});

// ─── fusão de complemento de tamanho ─────────────────────────────────────────

describe('GetOrdersUseCase — fusão de complemento de tamanho', () => {
  it('funde o tamanho seleccionado no título e preço do item pai', async () => {
    const sizeComplement = makeComplement('Escolha o Tamanho', [
      makeComplementItem('Grande', 3),
    ]);
    const item = makeItemChild({ title: 'Brigadeiro', plu: 'PLU-B', price: 5, childs: [sizeComplement] });
    const uc = makeStubs({
      'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [item])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    const [extracted] = orders[0].items;
    expect(extracted.title).toBe('Brigadeiro Grande');
    expect(extracted.price).toBe(8); // 5 + 3
  });

  it('detecta "size" (inglês) como complemento de tamanho', async () => {
    const sizeComplement = makeComplement('Size options', [
      makeComplementItem('Small', 0),
    ]);
    const item = makeItemChild({ title: 'Drink', plu: 'PLU-D', price: 2, childs: [sizeComplement] });
    const uc = makeStubs({
      'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [item])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders[0].items[0].title).toBe('Drink Small');
  });
});

// ─── add-ons pagos (não são de tamanho) ───────────────────────────────────────

describe('GetOrdersUseCase — add-ons pagos não-tamanho', () => {
  it('adiciona add-on pago como linha separada com "+" no título', async () => {
    const extraComplement = makeComplement('Extras', [
      makeComplementItem('Queijo Extra', 1.5, 'PLU-CHEESE'),
    ]);
    const item = makeItemChild({ title: 'Burger', plu: 'PLU-B', price: 8, childs: [extraComplement] });
    const uc = makeStubs({
      'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [item])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders[0].items).toHaveLength(2);
    expect(orders[0].items[0].title).toBe('Burger');
    expect(orders[0].items[1].title).toBe('+ Queijo Extra');
    expect(orders[0].items[1].price).toBe(1.5);
  });

  it('não cria linha para add-ons com preço 0', async () => {
    const freeComplement = makeComplement('Molhos', [
      makeComplementItem('Ketchup', 0),
    ]);
    const item = makeItemChild({ title: 'Burger', plu: 'PLU-B', price: 8, childs: [freeComplement] });
    const uc = makeStubs({
      'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [item])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders[0].items).toHaveLength(1);
    expect(orders[0].items[0].title).toBe('Burger');
  });
});

// ─── consolidação de divisões ─────────────────────────────────────────────────

describe('GetOrdersUseCase — consolidação por orderId', () => {
  it('uma ordem que aparece em duas divisões produz uma única AirMenuOrder', async () => {
    const item1 = makeItemChild({ title: 'Item A', plu: 'PLU-A', price: 10 });
    const item2 = makeItemChild({ title: 'Item B', plu: 'PLU-B', price: 5 });
    const uc = makeStubs({
      'ord-1': {
        'Divisão 1 Glovo': [makeOrderInstance('ord-1', [item1])],
        'Divisão 2 Glovo': [makeOrderInstance('ord-1', [item2])],
      },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders).toHaveLength(1);
    expect(orders[0].items).toHaveLength(2);
  });

  it('duas orders com ids distintos produzem dois registos', async () => {
    const uc = makeStubs({
      'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [makeItemChild()])] },
      'ord-2': { 'Glovo': [makeOrderInstance('ord-2', [makeItemChild()])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders).toHaveLength(2);
  });
});

// ─── filtro por documentDate ───────────────────────────────────────────────────

describe('GetOrdersUseCase — filtro por documentDate', () => {
  it('exclui orders cujo documentDate está fora do intervalo', async () => {
    /** FATURAR com timestamp antes do range (dia anterior). */
    const outOfRangeTs = new Date('2026-08-03T12:00:00.000Z').getTime();
    const item = makeItemChild();
    const uc = makeStubs({
      'ord-out': {
        'Glovo': [makeOrderInstance('ord-out', [item], {
          activeFlags: [{ key: 'FATURAR', operator: 'script', datetime: outOfRangeTs }],
        })],
      },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders).toHaveLength(0);
  });

  it('inclui orders cujo documentDate está dentro do intervalo', async () => {
    const uc = makeStubs({
      'ord-in': { 'Glovo': [makeOrderInstance('ord-in', [makeItemChild()])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders).toHaveLength(1);
  });
});

// ─── getOrderIds vazio ─────────────────────────────────────────────────────────

describe('GetOrdersUseCase — sem orders', () => {
  it('devolve array vazio quando getOrderIds retorna []', async () => {
    const uc = makeStubs({});
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders).toEqual([]);
  });
});

// ─── upgrade complement (Dobre a sua pizza) ───────────────────────────────────

describe('GetOrdersUseCase — upgrade complement "Dobre a sua pizza"', () => {
  it('identifica pizza como L quando complementItem de upgrade está presente', async () => {
    const upgradeComplement = makeComplement('Dobre a sua pizza 🍕', [
      makeComplementItem('Upgrade para L (20→25 cm)', 10),
    ]);
    const item = makeItemChild({ title: 'Honey Pepperoni', plu: 'ITM-1', price: 15.9, childs: [upgradeComplement] });
    const uc = makeStubs({
      'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [item])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    const [extracted] = orders[0].items;
    expect(extracted.title).toBe('Honey Pepperoni L');
    expect(extracted.price).toBe(25.9); // 15.9 + 10
  });

  it('identifica pizza como S quando complementItem de upgrade está ausente', async () => {
    const upgradeComplement = makeComplement('Dobre a sua pizza 🍕', []); // sem complementItem seleccionado
    const item = makeItemChild({ title: 'Chicken & Cheese', plu: 'ITM-2', price: 15.9, childs: [upgradeComplement] });
    const uc = makeStubs({
      'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [item])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    const [extracted] = orders[0].items;
    expect(extracted.title).toBe('Chicken & Cheese S');
    expect(extracted.price).toBe(15.9);
  });

  it('o complement "Dobre" não aparece como linha separada', async () => {
    const upgradeComplement = makeComplement('Dobre a sua pizza 🍕', [
      makeComplementItem('Upgrade para L (20→25 cm)', 10),
    ]);
    const item = makeItemChild({ title: 'Honey Pepperoni', plu: 'ITM-1', price: 15.9, childs: [upgradeComplement] });
    const uc = makeStubs({
      'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [item])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders[0].items).toHaveLength(1); // só a pizza, sem linha extra
  });

  it('detecta upgrade mesmo aninhado em múltiplas famílias', async () => {
    const upgradeComplement = makeComplement('Dobre a sua pizza 🍕', [
      makeComplementItem('Upgrade para L (20→25 cm)', 10),
    ]);
    const item = makeItemChild({ title: 'Honey Pepperoni', plu: 'ITM-1', price: 15.9, childs: [upgradeComplement] });
    const family = { title: 'Specials', menuRelation: 'family' as const, childs: [item] };
    const root   = { title: 'Menu',     menuRelation: 'family' as const, childs: [family] };
    const uc = makeStubs({
      'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [root])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders[0].items[0].title).toBe('Honey Pepperoni L');
  });
});

// ─── default S por família de pizza ───────────────────────────────────────────

describe('GetOrdersUseCase — default S por família de pizza', () => {
  for (const familyName of ['Classics', 'Specials', 'Sweeties']) {
    it(`assume S para item sem complement dentro da família "${familyName}"`, async () => {
      const item = makeItemChild({ title: 'Tomate e Pesto', plu: 'ITM-1', price: 13.9, childs: [] });
      const family = { title: familyName, menuRelation: 'family' as const, childs: [item] };
      const uc = makeStubs({
        'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [family])] },
      });
      const orders = await uc.execute(ENT_ID, START, END);
      expect(orders[0].items[0].title).toBe('Tomate e Pesto S');
    });
  }

  it('não aplica S a items fora de famílias de pizza', async () => {
    const item = makeItemChild({ title: 'Coca-Cola', plu: 'PLU-DRINK', price: 2, childs: [] });
    const family = { title: 'Drinks', menuRelation: 'family' as const, childs: [item] };
    const uc = makeStubs({
      'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [family])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders[0].items[0].title).toBe('Coca-Cola');
  });

  it('complement de upgrade tem prioridade sobre o default S da família', async () => {
    const upgradeComplement = makeComplement('Dobre a sua pizza 🍕', [
      makeComplementItem('Upgrade para L (20→25 cm)', 10),
    ]);
    const item = makeItemChild({ title: 'Honey Pepperoni', plu: 'ITM-2', price: 15.9, childs: [upgradeComplement] });
    const family = { title: 'Specials', menuRelation: 'family' as const, childs: [item] };
    const uc = makeStubs({
      'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [family])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders[0].items[0].title).toBe('Honey Pepperoni L');
  });

  it('propaga contexto de pizza através de nesting profundo (como no payload real)', async () => {
    const item = makeItemChild({ title: 'Tomate e Pesto', plu: 'ITM-1', price: 13.9, childs: [] });
    const classics = { title: 'Classics',  menuRelation: 'family' as const, childs: [item] };
    const menu1    = { title: 'Menu',      menuRelation: 'family' as const, childs: [classics] };
    const root1    = { title: 'Root',      menuRelation: 'family' as const, childs: [menu1] };
    const uc = makeStubs({
      'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [root1])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders[0].items[0].title).toBe('Tomate e Pesto S');
  });

  it('remove trailing space do título antes de adicionar o sufixo de tamanho', async () => {
    // Payload real da AirMenu tem títulos com espaço no fim: "Tomate e Pesto "
    const item = makeItemChild({ title: 'Tomate e Pesto ', plu: 'ITM-1', price: 13.9, childs: [] });
    const family = { title: 'Classics', menuRelation: 'family' as const, childs: [item] };
    const uc = makeStubs({
      'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [family])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders[0].items[0].title).toBe('Tomate e Pesto S'); // sem duplo espaço
  });
});

// ─── variantes do regex de upgrade ────────────────────────────────────────────

describe('GetOrdersUseCase — variantes do regex de upgrade', () => {
  it('detecta "dobrar" como variante do complement de upgrade', async () => {
    const upgradeComplement = makeComplement('Dobrar a pizza', [
      makeComplementItem('Upgrade para L (20→25 cm)', 10),
    ]);
    const item = makeItemChild({ title: 'Tomate e Pesto', plu: 'ITM-1', price: 13.9, childs: [upgradeComplement] });
    const uc = makeStubs({
      'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [item])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders[0].items[0].title).toBe('Tomate e Pesto L');
  });
});

// ─── normalização de sufixo legado ────────────────────────────────────────────

describe('GetOrdersUseCase — normalização de sufixo legado', () => {
  it('converte "- Grande" em L no título', async () => {
    const item = makeItemChild({ title: '4 Formaggios - Grande', plu: 'ITM-X', price: 25.9 });
    const uc = makeStubs({
      'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [item])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders[0].items[0].title).toBe('4 Formaggios L');
  });

  it('converte "- Individual" em S no título', async () => {
    const item = makeItemChild({ title: 'Tomate e Pesto - Individual', plu: 'ITM-Y', price: 12 });
    const uc = makeStubs({
      'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [item])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders[0].items[0].title).toBe('Tomate e Pesto S');
  });

  it('items sem sufixo legado não são alterados', async () => {
    const item = makeItemChild({ title: 'Coca-Cola', plu: 'ITM-Z', price: 2 });
    const uc = makeStubs({
      'ord-1': { 'Glovo': [makeOrderInstance('ord-1', [item])] },
    });
    const orders = await uc.execute(ENT_ID, START, END);
    expect(orders[0].items[0].title).toBe('Coca-Cola');
  });
});
