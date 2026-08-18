import type { PayableEntryWritePort } from "../../domain/ports/out/payable-entry-write.port.js";

export class FakePayableEntryWrite implements PayableEntryWritePort {
  created: Array<{ invoiceId: string; amount: number; dueDate: Date }> = [];
  markedPaid: Array<{ invoiceId: string; paidAt: Date }> = [];
  cancelled: string[] = [];
  renumbered: Array<{ invoiceId: string; newInvoiceNumber: string }> = [];

  async createForInvoice(data: Parameters<PayableEntryWritePort["createForInvoice"]>[0]): Promise<void> {
    this.created.push({ invoiceId: data.invoiceId, amount: data.amount, dueDate: data.dueDate });
  }

  async markPaidByInvoiceId(invoiceId: string, paidAt: Date): Promise<void> {
    this.markedPaid.push({ invoiceId, paidAt });
  }

  async cancelByInvoiceId(invoiceId: string): Promise<void> {
    this.cancelled.push(invoiceId);
  }

  async renumberByInvoiceId(invoiceId: string, newInvoiceNumber: string): Promise<void> {
    this.renumbered.push({ invoiceId, newInvoiceNumber });
  }
}
