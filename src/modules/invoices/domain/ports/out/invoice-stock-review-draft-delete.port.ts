import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** D10 — pede ao módulo `stock-purchase-review` para apagar (hard delete) uma revisão ainda não aplicada. */
export interface InvoiceStockReviewDraftDeletePort {
  deleteDraft(organizationId: OrganizationId, invoiceId: string, actor: string): Promise<{ deleted: boolean }>;
}
