import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { PayableEntryWritePort } from "../../domain/ports/out/payable-entry-write.port.js";

export class FakePayableEntryWrite implements PayableEntryWritePort {
  created: Array<{ invoiceId: string; amount: number; dueDate: Date }> = [];
  markedPaid: Array<{ invoiceId: string; paidAt: Date }> = [];
  cancelled: string[] = [];
  renumbered: Array<{ invoiceId: string; newInvoiceNumber: string }> = [];

  async createForInvoice(
    _organizationId: OrganizationId,
    data: Parameters<PayableEntryWritePort["createForInvoice"]>[1],
  ): Promise<void> {
    this.created.push({ invoiceId: data.invoiceId, amount: data.amount, dueDate: data.dueDate });
  }

  async markPaidByInvoiceId(_organizationId: OrganizationId, invoiceId: string, paidAt: Date): Promise<void> {
    this.markedPaid.push({ invoiceId, paidAt });
  }

  async cancelByInvoiceId(_organizationId: OrganizationId, invoiceId: string): Promise<void> {
    this.cancelled.push(invoiceId);
  }

  async renumberByInvoiceId(_organizationId: OrganizationId, invoiceId: string, newInvoiceNumber: string): Promise<void> {
    this.renumbered.push({ invoiceId, newInvoiceNumber });
  }
}
