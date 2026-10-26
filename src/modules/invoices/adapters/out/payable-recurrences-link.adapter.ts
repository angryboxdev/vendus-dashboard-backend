import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { AutoLinkInvoicePort, ReleaseInvoiceLinksPort } from "../../../payable-recurrences/domain/ports/in/invoice-link.ports.js";
import type { RecurrenceLinkPort } from "../../domain/ports/out/recurrence-link.port.js";

/** Delega nos input ports do módulo payable-recurrences (mesmo padrão dos adapters de stock-purchase-review). */
export class PayableRecurrencesLinkAdapter implements RecurrenceLinkPort {
  constructor(
    private readonly autoLink: AutoLinkInvoicePort,
    private readonly release: ReleaseInvoiceLinksPort,
  ) {}

  async autoLinkInvoice(organizationId: OrganizationId, invoiceId: string): Promise<void> {
    await this.autoLink.execute({ organizationId, invoiceId });
  }

  async releaseInvoice(organizationId: OrganizationId, invoiceId: string, paymentGroupId: string | null): Promise<void> {
    await this.release.execute({ organizationId, invoiceId, paymentGroupId });
  }
}
