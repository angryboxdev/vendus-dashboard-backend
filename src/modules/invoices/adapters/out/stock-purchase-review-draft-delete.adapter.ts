import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { InvoiceStockReviewDraftDeletePort } from "../../domain/ports/out/invoice-stock-review-draft-delete.port.js";
import type { DeleteDraftStockPurchaseReviewPort } from "../../../stock-purchase-review/domain/ports/in/stock-purchase-review.ports.js";

/** D10 — delega diretamente para o input port do módulo `stock-purchase-review`, sem tradução (mesmo padrão de `StockPurchaseReviewDecisionAdapter`). */
export class StockPurchaseReviewDraftDeleteAdapter implements InvoiceStockReviewDraftDeletePort {
  constructor(private readonly deleteDraft_: DeleteDraftStockPurchaseReviewPort) {}

  async deleteDraft(organizationId: OrganizationId, invoiceId: string, actor: string): Promise<{ deleted: boolean }> {
    return this.deleteDraft_.execute({ organizationId, invoiceId, actor });
  }
}
