import type { InvoiceAmountsRecord, InvoiceAmountsWritePort } from "../../domain/ports/out/invoice-amounts-write.port.js";

export class FakeInvoiceAmountsWrite implements InvoiceAmountsWritePort {
  saved = new Map<string, InvoiceAmountsRecord>();
  async save(_o: unknown, invoiceId: string, record: InvoiceAmountsRecord): Promise<void> {
    this.saved.set(invoiceId, record);
  }
}
