import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * D10 → `stock_purchase_reviews`/`stock_review_lines` (módulo
 * `stock-purchase-review`). Lido diretamente por `ScopedQuery` pela mesma
 * razão de `LearnedMappingReadPort` (nenhum port público exposto por esse
 * módulo para esta consulta, e alterá-lo está fora do âmbito aprovado —
 * ver README). Só reduz confiança (secção 9) — nunca soma ao stock, nunca
 * assume que a compra pendente já chegou.
 */
export interface PendingPurchaseReviewReadPort {
  /** `true` quando há pelo menos uma "Compra por rever" pendente que resolve para este item de stock. */
  hasPendingReviewForItem(organizationId: OrganizationId, stockItemId: string): Promise<boolean>;
}
