import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { InvoiceReadPort, InvoiceSnapshot } from "../../domain/ports/out/invoice-read.port.js";

export function invoiceSnapshotStub(overrides: Partial<InvoiceSnapshot> = {}): InvoiceSnapshot {
  return {
    id: "inv-1",
    invoiceNumber: "FT 1",
    invoiceDate: "2026-09-20",
    supplierId: "sup-1",
    supplierName: "Makro",
    supplierNif: "123456789",
    status: "pending",
    stockReviewOverride: "auto",
    stockReviewOverrideReason: null,
    lines: [],
    ...overrides,
  };
}

export class FakeInvoiceRead implements InvoiceReadPort {
  invoices = new Map<string, InvoiceSnapshot>();

  async getInvoice(_organizationId: OrganizationId, invoiceId: string): Promise<InvoiceSnapshot | null> {
    return this.invoices.get(invoiceId) ?? null;
  }

  async listFinalizedSince(_organizationId: OrganizationId, _sinceDate: string): Promise<InvoiceSnapshot[]> {
    return [...this.invoices.values()];
  }
}
