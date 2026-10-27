import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { GetInvoiceAlertsPort } from "../../../invoices/domain/ports/in/invoice.ports.js";
import type { InvoicesToReviewReadPort } from "../../domain/ports/out/invoices-to-review-read.port.js";

/** Bridges o `GetInvoiceAlertsPort` do módulo `invoices` (D10): o mesmo «para rever» dos alertas das faturas. */
export class InvoiceAlertsToReviewAdapter implements InvoicesToReviewReadPort {
  constructor(private readonly getInvoiceAlerts: GetInvoiceAlertsPort) {}

  async count(organizationId: OrganizationId): Promise<number> {
    return (await this.getInvoiceAlerts.execute(organizationId)).pendingReviewCount;
  }
}
