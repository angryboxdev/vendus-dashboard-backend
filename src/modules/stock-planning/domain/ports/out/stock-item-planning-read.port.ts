import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface StockItemPlanningSnapshot {
  id: string;
  name: string;
  categoryId: string;
  baseUnit: string;
  isActive: boolean;
  minStockQty: number;
  /** `stock_items.safety_stock_qty` — distinto de `min_stock` (secção 43); `null` quando o utilizador nunca configurou. */
  safetyStockQty: number | null;
  purchaseReferenceUnitCostWithoutVat: number | null;
}

/** Lê diretamente a tabela legacy `stock_items` (nunca via `stockItemService.ts`) — só os campos relevantes para planeamento. */
export interface StockItemPlanningReadPort {
  listActive(organizationId: OrganizationId): Promise<StockItemPlanningSnapshot[]>;
  findById(organizationId: OrganizationId, id: string): Promise<StockItemPlanningSnapshot | null>;
}
