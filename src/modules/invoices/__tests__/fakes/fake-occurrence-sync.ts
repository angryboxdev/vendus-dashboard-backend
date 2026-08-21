import type { OccurrenceSyncPort } from "../../domain/ports/out/occurrence-sync.port.js";

export class FakeOccurrenceSync implements OccurrenceSyncPort {
  readonly calls: Array<{ invoiceId: string; paidAt: Date }> = [];

  async markPaidByInvoiceId(invoiceId: string, paidAt: Date): Promise<void> {
    this.calls.push({ invoiceId, paidAt });
  }
}
