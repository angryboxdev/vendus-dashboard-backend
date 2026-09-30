import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { InvoiceStockReviewDraftDeletePort } from "../../domain/ports/out/invoice-stock-review-draft-delete.port.js";

export class FakeInvoiceStockReviewDraftDelete implements InvoiceStockReviewDraftDeletePort {
  readonly calls: { organizationId: OrganizationId; invoiceId: string; actor: string }[] = [];
  result: { deleted: boolean } = { deleted: true };

  async deleteDraft(organizationId: OrganizationId, invoiceId: string, actor: string): Promise<{ deleted: boolean }> {
    this.calls.push({ organizationId, invoiceId, actor });
    return this.result;
  }
}
