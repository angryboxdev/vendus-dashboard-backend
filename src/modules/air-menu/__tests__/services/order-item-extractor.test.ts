import { extractItems } from '../../domain/services/order-item-extractor.js';
import type { RawOrderItemInstance } from '../../domain/ports/out/air-menu-gateway.port.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function item(title: string, plu: string, price: number, childs: RawOrderItemInstance[] = []): RawOrderItemInstance {
  return { title, plu, price, count: 1, menuRelation: 'item', childs };
}

function family(title: string, plu: string, childs: RawOrderItemInstance[]): RawOrderItemInstance {
  return { title, plu, menuRelation: 'family', childs };
}

function complexItem(title: string, plu: string, price: number, childs: RawOrderItemInstance[]): RawOrderItemInstance {
  return { title, plu, price, count: 1, menuRelation: 'complexItem', childs };
}

// ─── Discount (AM_PROMO) ──────────────────────────────────────────────────────

describe('extractItems — discount (AM_PROMO)', () => {
  const amDiscountChild = item('Desconto', 'AM_DISCOUNT', 0);
  const amPromoNode = complexItem('Promoção', 'AM_PROMO', -8.9, [amDiscountChild]);
  const linkItemsFamily = family('LINK ITEMS', 'AM_LINK_ITEMS', [amPromoNode]);

  it('emits a discount line with the correct negative price', () => {
    const result = extractItems([linkItemsFamily]);
    const discount = result.find((i) => i.plu === 'AM_DISCOUNT');
    expect(discount).toBeDefined();
    expect(discount!.price).toBe(-8.9);
    expect(discount!.count).toBe(1);
    expect(discount!.title).toBe('Desconto');
  });

  it('does not emit the placeholder AM_DISCOUNT child at price 0', () => {
    const result = extractItems([linkItemsFamily]);
    const zeros = result.filter((i) => i.plu === 'AM_DISCOUNT' && i.price === 0);
    expect(zeros).toHaveLength(0);
  });

  it('emits exactly one discount line per AM_PROMO node', () => {
    const result = extractItems([linkItemsFamily]);
    const discounts = result.filter((i) => i.plu === 'AM_DISCOUNT');
    expect(discounts).toHaveLength(1);
  });

  it('captures the discount alongside the food items in a mixed tree', () => {
    const pizza = family('Specials', 'FAM-1', [item('Honey Pepperoni', 'ITM-1', 15.9)]);
    const root = family('Root', '', [family('Menu', '', [pizza]), linkItemsFamily]);

    const result = extractItems([root]);

    // 'Specials' activates the pizza-family context → item gets " S" suffix
    expect(result.some((i) => i.title === 'Honey Pepperoni S')).toBe(true);
    expect(result.some((i) => i.plu === 'AM_DISCOUNT' && i.price === -8.9)).toBe(true);
  });

  it('total including discount equals net amount', () => {
    const pizza = family('Specials', 'FAM-1', [item('Honey Pepperoni', 'ITM-1', 15.9)]);
    const root = family('Root', '', [family('Menu', '', [pizza]), linkItemsFamily]);

    const result = extractItems([root]);
    const total = result.reduce((sum, i) => sum + i.price * i.count, 0);

    expect(total).toBeCloseTo(15.9 - 8.9, 5); // 7.0
  });
});
