import type { InvoiceSnapshot, InvoiceReadPort } from "../../domain/ports/out/invoice-read.port.js";

export class FakeInvoiceRead implements InvoiceReadPort {
  private store = new Map<string, InvoiceSnapshot>();
  markedPaid: Array<{ invoiceId: string; paidAt: Date }> = [];

  seed(invoice: InvoiceSnapshot): void {
    this.store.set(invoice.id, invoice);
  }

  async findById(id: string): Promise<InvoiceSnapshot | null> {
    return this.store.get(id) ?? null;
  }

  async markPaid(invoiceId: string, paidAt: Date): Promise<void> {
    this.markedPaid.push({ invoiceId, paidAt });
  }
}
