import type { InvoiceAuditEntry, InvoiceAuditPort } from "../../domain/ports/out/invoice-audit.port.js";

export class FakeInvoiceAudit implements InvoiceAuditPort {
  entries: InvoiceAuditEntry[] = [];
  async record(_o: unknown, entry: InvoiceAuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}
