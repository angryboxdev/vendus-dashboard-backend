import type { WebhookOrderEvent } from '../../../air-menu/domain/ports/out/order-event-bus.port.js';
import type { RawOrderItemInstance } from '../../../air-menu/domain/ports/out/air-menu-gateway.port.js';
import { extractItems, applyLegacyNormalization } from '../../../air-menu/domain/services/order-item-extractor.js';
import type { Delivery, DeliveryItem } from '../../domain/entities/delivery.js';

interface SimplifiedItem {
  quantity?: number;
  price?: number;
  plu?: string;
  name?: string;
}

function derivePlatform(orders: Record<string, unknown>): string {
  const divisionName = Object.keys(orders)[0] ?? '';
  const lower = divisionName.toLowerCase();
  if (lower.includes('glovo')) return 'Glovo';
  if (lower.includes('uber')) return 'Uber Eats';
  if (lower.includes('bolt')) return 'Bolt Food';
  return 'AirMenu';
}

/**
 * Extracts AM_PROVIDER_ORDER_ID from the first order instance in the orders map.
 * Returns null if not present or empty.
 *
 * Payload structure:
 *   orders[divisionName][0].extraInfo[0].AM_PROVIDER_ORDER_ID
 */
function extractProviderOrderId(orders: Record<string, unknown>): string | null {
  const firstDivision = Object.values(orders)[0];
  if (!Array.isArray(firstDivision) || firstDivision.length === 0) return null;

  const instance = firstDivision[0] as Record<string, unknown>;
  const rawExtraInfo = instance['extraInfo'];

  // extraInfo can be an array of objects or a single object
  const extraInfoArr = Array.isArray(rawExtraInfo)
    ? rawExtraInfo
    : rawExtraInfo != null ? [rawExtraInfo] : [];

  for (const entry of extraInfoArr as Array<Record<string, unknown>>) {
    const val = entry['AM_PROVIDER_ORDER_ID'];
    if (typeof val === 'string' && val.trim() !== '') return val.trim();
  }
  return null;
}

/**
 * Maps an AirMenu webhook event (CREATED) to a KDS Delivery.
 * Returns null if the payload is missing required fields.
 */
export function mapAirMenuEventToDelivery(event: WebhookOrderEvent): Delivery | null {
  if (event.event !== 'CREATED') return null;

  const payload = event.payload as Record<string, unknown>;

  const orderId = typeof payload['orderId'] === 'number' ? payload['orderId'] : null;
  if (orderId === null) return null;

  const simplifiedItems = Array.isArray(payload['simplifiedItems'])
    ? (payload['simplifiedItems'] as SimplifiedItem[])
    : [];

  const orders =
    typeof payload['orders'] === 'object' && payload['orders'] !== null
      ? (payload['orders'] as Record<string, unknown>)
      : {};

  const platform = derivePlatform(orders);
  const providerOrderId = extractProviderOrderId(orders);

  // Prefer the nested `orders` structure (same shape as GetOrders) so we can
  // resolve sizes from complement trees. Fall back to simplifiedItems (with
  // legacy-suffix normalisation) when no nested items are found.
  const ordersMap =
    typeof payload['orders'] === 'object' && payload['orders'] !== null
      ? (payload['orders'] as Record<string, RawOrderItemInstance[]>)
      : {};

  const nestedItems = Object.values(ordersMap).flatMap((instances) =>
    instances.flatMap((instance) => extractItems(instance.childs ?? [])),
  );

  const items: DeliveryItem[] = nestedItems.length > 0
    ? nestedItems.map((item, idx) => ({
        id: idx,
        name: item.title,
        qty: item.count,
        notes: '',
      }))
    : simplifiedItems.map((item, idx) => ({
        id: idx,
        name: applyLegacyNormalization(item.name ?? ''),
        qty: item.quantity ?? 1,
        notes: '',
      }));

  return {
    id: orderId,
    reference: orderId,
    type: 'delivery',
    status: 'pending',
    source: platform,
    kitchenId: 0,
    tableId: 0,
    table: null,
    items,
    extraInfo: JSON.stringify({
      platform,
      airMenuOrderId: orderId,
      providerOrderId,   // ID da plataforma (Glovo, Uber Eats, Bolt) — null se não disponível
      enterpriseId: event.enterpriseId,
    }),
    dateCreate: event.receivedAt.toISOString(),
  };
}
