import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { StockItemPlanningReadPort, StockItemPlanningSnapshot } from "../../domain/ports/out/stock-item-planning-read.port.js";

interface ItemRow {
  id: string;
  name: string;
  category_id: string;
  base_unit: string;
  is_active: boolean;
  min_stock: number;
  safety_stock_qty: number | null;
  purchase_reference_unit_cost_without_vat: number | null;
}

const ITEM_SELECT = "id, name, category_id, base_unit, is_active, min_stock, safety_stock_qty, purchase_reference_unit_cost_without_vat";

function toSnapshot(row: ItemRow): StockItemPlanningSnapshot {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    baseUnit: row.base_unit,
    isActive: Boolean(row.is_active),
    minStockQty: Number(row.min_stock ?? 0),
    safetyStockQty: row.safety_stock_qty != null ? Number(row.safety_stock_qty) : null,
    purchaseReferenceUnitCostWithoutVat:
      row.purchase_reference_unit_cost_without_vat != null ? Number(row.purchase_reference_unit_cost_without_vat) : null,
  };
}

/** Lê diretamente a tabela legacy `stock_items` (nunca via `stockItemService.ts` — CLAUDE.md). */
export class StockItemPlanningReadAdapter implements StockItemPlanningReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async listActive(organizationId: OrganizationId): Promise<StockItemPlanningSnapshot[]> {
    const { data, error } = await this.scopedQuery(organizationId).table("stock_items").select(ITEM_SELECT).eq("is_active", true);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as ItemRow[]).map(toSnapshot);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<StockItemPlanningSnapshot | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("stock_items").select(ITEM_SELECT).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toSnapshot(data as unknown as ItemRow) : null;
  }
}
