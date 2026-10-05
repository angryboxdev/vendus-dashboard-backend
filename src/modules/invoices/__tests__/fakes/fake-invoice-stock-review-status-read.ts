import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  InvoiceStockReviewStatusReadPort,
  InvoiceStockReviewStatusSnapshot,
} from "../../domain/ports/out/invoice-stock-review-status-read.port.js";

/** Fake de teste — sem revisão associada a nenhuma fatura até se chamar `seed`. */
export class FakeInvoiceStockReviewStatusRead implements InvoiceStockReviewStatusReadPort {
  private byInvoiceId = new Map<string, InvoiceStockReviewStatusSnapshot>();

  seed(invoiceId: string, snapshot: InvoiceStockReviewStatusSnapshot): void {
    this.byInvoiceId.set(invoiceId, snapshot);
  }

  async findForInvoice(_organizationId: OrganizationId, invoiceId: string): Promise<InvoiceStockReviewStatusSnapshot> {
    return this.byInvoiceId.get(invoiceId) ?? null;
  }
}
