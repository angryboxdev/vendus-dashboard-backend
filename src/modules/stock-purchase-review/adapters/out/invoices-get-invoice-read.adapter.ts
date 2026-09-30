import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { GetInvoicePort, InvoiceDTO, ListInvoicesPort } from "../../../invoices/domain/ports/in/invoice.ports.js";
import type { InvoiceReadPort, InvoiceSnapshot } from "../../domain/ports/out/invoice-read.port.js";

function toSnapshot(invoice: InvoiceDTO): InvoiceSnapshot {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    supplierId: invoice.supplierId,
    supplierName: invoice.supplierName,
    supplierNif: invoice.supplierNifSnapshot,
    status: invoice.status,
    stockReviewOverride: invoice.stockReviewOverride,
    stockReviewOverrideReason: invoice.stockReviewOverrideReason,
    lines: (invoice.lines ?? []).map((l) => ({
      id: l.id,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitCostWithoutVat: l.unitCostWithoutVat,
      totalWithVat: l.totalWithVat,
      costCenterCategoryId: l.costCenterCategoryId,
      locationId: l.locationId,
    })),
  };
}

/** D10 — tradução fina sobre `invoices`' `GetInvoicePort`/`ListInvoicesPort`. */
export class InvoicesGetInvoiceReadAdapter implements InvoiceReadPort {
  constructor(
    private readonly getInvoicePort: GetInvoicePort,
    private readonly listInvoicesPort: ListInvoicesPort,
  ) {}

  async getInvoice(organizationId: OrganizationId, invoiceId: string): Promise<InvoiceSnapshot | null> {
    try {
      const invoice = await this.getInvoicePort.execute(organizationId, invoiceId);
      return toSnapshot(invoice);
    } catch {
      return null;
    }
  }

  async listFinalizedSince(organizationId: OrganizationId, sinceDate: string): Promise<InvoiceSnapshot[]> {
    const invoices = await this.listInvoicesPort.execute(organizationId, { from: sinceDate });
    return invoices.filter((inv) => inv.status !== "cancelled" && inv.status !== "draft_ai").map(toSnapshot);
  }
}
