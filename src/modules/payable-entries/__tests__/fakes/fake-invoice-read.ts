import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { InvoiceSnapshot, InvoiceReadPort } from "../../domain/ports/out/invoice-read.port.js";

function key(organizationId: OrganizationId, id: string): string {
  return `${organizationId}:${id}`;
}

export class FakeInvoiceRead implements InvoiceReadPort {
  private store = new Map<string, InvoiceSnapshot>();
  markedPaid: Array<{ invoiceId: string; paidAt: Date }> = [];

  seed(organizationId: OrganizationId, invoice: InvoiceSnapshot): void {
    this.store.set(key(organizationId, invoice.id), invoice);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<InvoiceSnapshot | null> {
    return this.store.get(key(organizationId, id)) ?? null;
  }

  async markPaid(_organizationId: OrganizationId, invoiceId: string, paidAt: Date): Promise<void> {
    this.markedPaid.push({ invoiceId, paidAt });
  }
}
