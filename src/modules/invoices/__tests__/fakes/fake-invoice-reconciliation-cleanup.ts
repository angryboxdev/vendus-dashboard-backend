import type { InvoiceReconciliationCleanupPort } from "../../domain/ports/out/invoice-reconciliation-cleanup.port.js";

export class FakeInvoiceReconciliationCleanup implements InvoiceReconciliationCleanupPort {
  removedInvoiceIds: string[] = [];
  renumbered: Array<{ invoiceId: string; newLabel: string }> = [];

  async removeLinksForInvoice(invoiceId: string): Promise<void> {
    this.removedInvoiceIds.push(invoiceId);
  }

  async renumberLinksForInvoice(invoiceId: string, newLabel: string): Promise<void> {
    this.renumbered.push({ invoiceId, newLabel });
  }
}
