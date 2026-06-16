import type { InvoiceLine } from "../../entities/invoice-line.js";

export interface InvoiceLineRepositoryPort {
  saveAll(lines: InvoiceLine[]): Promise<void>;
  findByInvoiceId(invoiceId: string): Promise<InvoiceLine[]>;
  updateLine(line: InvoiceLine): Promise<void>;
  deleteByInvoiceId(invoiceId: string): Promise<void>;
}
