import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { StockQuantityReadPort, StockQuantitySnapshot } from "../../domain/ports/out/stock-quantity-read.port.js";

interface RpcRow {
  item_id: string;
  total_quantity: number;
  last_purchase_with_vat: number | null;
  last_purchase_without_vat: number | null;
}

/**
 * Wrapper fino sobre `get_stock_quantities_with_last_purchase` (RPC
 * já existente e já reaproveitada por `src/services/stockItemService.ts`) —
 * mesmo padrão de acesso, nunca duplicada.
 */
export class StockQuantityReadAdapter implements StockQuantityReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async getQuantities(organizationId: OrganizationId, stockItemIds: string[]): Promise<Map<string, StockQuantitySnapshot>> {
    const out = new Map<string, StockQuantitySnapshot>();
    for (const id of stockItemIds) {
      out.set(id, { stockItemId: id, currentQuantity: 0, lastPurchaseUnitCostWithoutVat: null });
    }
    if (stockItemIds.length === 0) return out;

    const { data, error } = await this.scopedQuery(organizationId).getStockQuantitiesWithLastPurchase(stockItemIds);
    if (error) throw new Error(`Stock quantities RPC: ${error.message}`);

    for (const row of (data ?? []) as unknown as RpcRow[]) {
      out.set(row.item_id, {
        stockItemId: row.item_id,
        currentQuantity: Number(row.total_quantity),
        lastPurchaseUnitCostWithoutVat: row.last_purchase_without_vat != null ? Number(row.last_purchase_without_vat) : null,
      });
    }
    return out;
  }
}
