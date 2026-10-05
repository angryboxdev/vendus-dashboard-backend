import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  InvoiceStockReviewStatusReadPort,
  InvoiceStockReviewStatusSnapshot,
} from "../../domain/ports/out/invoice-stock-review-status-read.port.js";
import type { GetStockPurchaseReviewStatusPort } from "../../../stock-purchase-review/domain/ports/in/stock-purchase-review.ports.js";

/** D10 — delega diretamente para o input port do módulo `stock-purchase-review`, sem tradução (mesmo padrão de `StockPurchaseReviewDecisionAdapter`). */
export class StockPurchaseReviewStatusReadAdapter implements InvoiceStockReviewStatusReadPort {
  constructor(private readonly getStatus: GetStockPurchaseReviewStatusPort) {}

  async findForInvoice(organizationId: OrganizationId, invoiceId: string): Promise<InvoiceStockReviewStatusSnapshot> {
    return this.getStatus.execute({ organizationId, invoiceId });
  }
}
