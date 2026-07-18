import { vendusGet, vendusBasicWrite, vendusPatch } from '../../../../infra/vendusClient.js';
import type { DeliveryGatewayPort } from '../../domain/ports/out/delivery-gateway.port.js';
import type {
  Delivery,
  DeliveryItem,
  DeliveryStatus,
  DeliveryType,
} from '../../domain/entities/delivery.js';

interface VendusDeliveryItem {
  ukey_id?: number;
  id?: number;
  title?: string;
  name?: string;
  qty?: string | number;
  quantity?: number;
  text?: string;
  notes?: string;
  extra_info?: string;
}

interface VendusDelivery {
  id: number;
  reference: number;
  type: string;
  status: string;
  source?: string;
  kitchen_id: number;
  table_id: number;
  table?: { id?: number; title?: string; name?: string } | null;
  items?: VendusDeliveryItem[] | string;
  extra_info?: string;
  date_create?: string;
  date_update?: string;
}

function parseItems(raw: VendusDeliveryItem[] | string | undefined): VendusDeliveryItem[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as VendusDeliveryItem[]) : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw : [];
}

function mapItem(raw: VendusDeliveryItem): DeliveryItem {
  return {
    id: raw.ukey_id ?? raw.id ?? 0,
    name: raw.title ?? raw.name ?? '',
    qty: typeof raw.qty === 'string' ? (parseInt(raw.qty, 10) || 1) : (raw.qty ?? raw.quantity ?? 1),
    notes: raw.text ?? raw.notes ?? '',
  };
}

function mapDelivery(raw: VendusDelivery): Delivery {
  return {
    id: raw.id,
    reference: raw.reference,
    type: raw.type as DeliveryType,
    status: raw.status as DeliveryStatus,
    source: raw.source ?? '',
    kitchenId: raw.kitchen_id,
    tableId: raw.table_id,
    table: raw.table
      ? { ...(raw.table.id !== undefined && { id: raw.table.id }), name: raw.table.title ?? raw.table.name ?? '' }
      : null,
    items: parseItems(raw.items).map(mapItem),
    extraInfo: raw.extra_info ?? '',
    ...(raw.date_create !== undefined && { dateCreate: raw.date_create }),
    ...(raw.date_update !== undefined && { dateUpdate: raw.date_update }),
  };
}

export class VendusDeliveryGateway implements DeliveryGatewayPort {
  async getActive(): Promise<Delivery[]> {
    try {
      const raw = await vendusGet<VendusDelivery[] | { errors?: unknown }>(
        '/v1.1/delivery/',
        { status: 'pending,received,cooking,waiting_to_delivery,delivered', per_page: 100 },
      );
      if (!Array.isArray(raw)) return [];
      return raw.map(mapDelivery);
    } catch (e) {
      // Vendus retorna 404 "No data" quando não há pedidos activos — tratar como lista vazia
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('404')) return [];
      throw e;
    }
  }

  async updateStatus(id: number, status: DeliveryStatus): Promise<void> {
    const attempts: Array<() => Promise<unknown>> = [
      () => vendusPatch(`/v1.1/delivery/${id}/`, { status }),
      () => vendusPatch(`/v1.1/delivery/${id}`, { status }),
      () => vendusBasicWrite('PUT', `/v1.1/delivery/${id}/`, { status }),
      () => vendusBasicWrite('PUT', `/v1.1/delivery/${id}`, { status }),
      () => vendusBasicWrite('PATCH', `/v1.1/delivery/${id}/`, { status }),
    ];

    let lastError: Error | null = null;
    for (const attempt of attempts) {
      try {
        await attempt();
        return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // só continua se for 404 ou 405 (rota não encontrada / método não suportado)
        if (msg.includes('404') || msg.includes('405')) {
          lastError = e instanceof Error ? e : new Error(msg);
          continue;
        }
        throw e; // outro erro (401, 422, etc.) — propaga imediatamente
      }
    }
    throw lastError ?? new Error('All Vendus update attempts failed');
  }
}
