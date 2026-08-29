import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { OccurrenceSyncPort } from "../../domain/ports/out/occurrence-sync.port.js";

export class FakeOccurrenceSync implements OccurrenceSyncPort {
  readonly calls: Array<{ invoiceId: string; paidAt: Date }> = [];

  async markPaidByInvoiceId(_organizationId: OrganizationId, invoiceId: string, paidAt: Date): Promise<void> {
    this.calls.push({ invoiceId, paidAt });
  }
}
