import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface StockQuantitySnapshot {
  stockItemId: string;
  /** Saldo teórico atual — `SUM(stock_movements.quantity)`; pode ser negativo (dado corrompido) e é usado assim mesmo, com aviso de qualidade (secção 89). */
  currentQuantity: number;
  lastPurchaseUnitCostWithoutVat: number | null;
}

/** Wrapper fino sobre `get_stock_quantities_with_last_purchase` (RPC já existente, reaproveitada — nunca duplicada). */
export interface StockQuantityReadPort {
  getQuantities(organizationId: OrganizationId, stockItemIds: string[]): Promise<Map<string, StockQuantitySnapshot>>;
}
