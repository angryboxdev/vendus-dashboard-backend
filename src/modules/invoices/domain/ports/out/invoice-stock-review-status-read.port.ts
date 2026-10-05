import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export type InvoiceStockReviewStatus = "pending" | "in_review" | "partial" | "ready" | "applied" | "cancelled";

export type InvoiceStockReviewStatusSnapshot = { reviewId: string; status: InvoiceStockReviewStatus } | null;

/** D10 — leitura fina do módulo `stock-purchase-review`: existe uma revisão de stock para esta fatura, e em que estado. */
export interface InvoiceStockReviewStatusReadPort {
  findForInvoice(organizationId: OrganizationId, invoiceId: string): Promise<InvoiceStockReviewStatusSnapshot>;
}
