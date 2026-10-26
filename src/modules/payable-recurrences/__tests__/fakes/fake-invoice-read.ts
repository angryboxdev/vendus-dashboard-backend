import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { InvoiceReadPort, InvoiceSnapshot } from "../../domain/ports/out/invoice-read.port.js";

function key(organizationId: OrganizationId, id: string): string {
  return `${organizationId}:${id}`;
}

type Defaults = "invoiceDate" | "costCenterGroupId" | "costCenterCategoryId" | "documentType" | "paymentGroupId";
type SeedInvoice = Omit<InvoiceSnapshot, Defaults> & Partial<Pick<InvoiceSnapshot, Defaults>>;

export class FakeInvoiceRead implements InvoiceReadPort {
  private readonly store = new Map<string, InvoiceSnapshot>();

  seed(organizationId: OrganizationId, invoice: SeedInvoice): void {
    this.store.set(key(organizationId, invoice.id), {
      invoiceDate: "2026-09-15",
      costCenterGroupId: null,
      costCenterCategoryId: null,
      documentType: "invoice",
      paymentGroupId: null,
      ...invoice,
    });
  }

  remove(organizationId: OrganizationId, id: string): void {
    this.store.delete(key(organizationId, id));
  }

  async findById(organizationId: OrganizationId, id: string): Promise<InvoiceSnapshot | null> {
    return this.store.get(key(organizationId, id)) ?? null;
  }

  async findPaymentGroupMembers(organizationId: OrganizationId, invoiceIds: string[]): Promise<Map<string, InvoiceSnapshot[]>> {
    const out = new Map<string, InvoiceSnapshot[]>();
    for (const id of invoiceIds) {
      const inv = await this.findById(organizationId, id);
      if (!inv) continue;
      out.set(id, inv.paymentGroupId ? await this.findByPaymentGroup(organizationId, inv.paymentGroupId) : [inv]);
    }
    return out;
  }

  async findByPaymentGroup(organizationId: OrganizationId, paymentGroupId: string): Promise<InvoiceSnapshot[]> {
    const prefix = `${organizationId}:`;
    return [...this.store.entries()]
      .filter(([k, i]) => k.startsWith(prefix) && i.paymentGroupId === paymentGroupId && i.status !== "cancelled")
      .map(([, i]) => i);
  }
}
