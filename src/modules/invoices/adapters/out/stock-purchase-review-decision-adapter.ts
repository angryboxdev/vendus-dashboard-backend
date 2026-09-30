import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { InvoiceFinalizedForStockData, StockDecisionNotifyPort } from "../../domain/ports/out/stock-decision-notify.port.js";
import type { RecordInvoiceFinalizedForStockPort } from "../../../stock-purchase-review/domain/ports/in/stock-purchase-review.ports.js";

/** D10 — delega diretamente para o input port do módulo `stock-purchase-review`, sem tradução (mesmo padrão de `FinancialBaseSupplierCreateAdapter`). */
export class StockPurchaseReviewDecisionAdapter implements StockDecisionNotifyPort {
  constructor(private readonly recordInvoiceFinalizedForStock: RecordInvoiceFinalizedForStockPort) {}

  async notifyInvoiceFinalized(organizationId: OrganizationId, data: InvoiceFinalizedForStockData): Promise<void> {
    await this.recordInvoiceFinalizedForStock.execute({ organizationId, ...data });
  }
}
