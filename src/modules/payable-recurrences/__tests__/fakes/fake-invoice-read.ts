import type { InvoiceReadPort, InvoiceSnapshot } from "../../domain/ports/out/invoice-read.port.js";

export class FakeInvoiceRead implements InvoiceReadPort {
  private readonly store = new Map<string, InvoiceSnapshot>();

  seed(invoice: InvoiceSnapshot): void {
    this.store.set(invoice.id, invoice);
  }

  async findById(id: string): Promise<InvoiceSnapshot | null> {
    return this.store.get(id) ?? null;
  }
}
