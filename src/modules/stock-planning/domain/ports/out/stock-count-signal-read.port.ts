import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface StockCountSignalSnapshot {
  /** `null` quando o item nunca foi contado fisicamente. */
  lastCompletedCountAt: Date | null;
  /** `slow_moving_days_threshold` de `stock_count_settings` — configurável, nunca hardcoded (secção 70). `null` = sem limite configurado. */
  slowMovingDaysThreshold: number | null;
}

/**
 * D10 → `stock_count_sessions`/`stock_count_lines`/`stock_count_settings`
 * (módulo `stock-count`). Lido diretamente por `ScopedQuery` pela mesma
 * razão de `LearnedMappingReadPort`/`PendingPurchaseReviewReadPort` — ver
 * README. Só alimenta a confiança/deteção de excesso de stock, nunca
 * altera contagens.
 */
export interface StockCountSignalReadPort {
  getSignalForItem(organizationId: OrganizationId, stockItemId: string): Promise<StockCountSignalSnapshot>;
}
