import type { InvoiceMarkPaidPort } from "../../domain/ports/out/invoice-mark-paid.port.js";

export class FakeInvoiceMarkPaid implements InvoiceMarkPaidPort {
  readonly marked: Array<{ invoiceId: string; paidAt: Date }> = [];

  async markPaid(invoiceId: string, paidAt: Date): Promise<void> {
    this.marked.push({ invoiceId, paidAt });
  }
}
