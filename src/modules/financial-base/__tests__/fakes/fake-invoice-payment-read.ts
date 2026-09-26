import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { InvoicePayment, InvoicePaymentReadPort } from "../../domain/ports/out/invoice-payment-read.port.js";

export class FakeInvoicePaymentReadAdapter implements InvoicePaymentReadPort {
  private readonly payments: InvoicePayment[] = [];

  seedPayment(payment: InvoicePayment): void {
    this.payments.push(payment);
  }

  async findByInvoiceIds(_organizationId: OrganizationId, invoiceIds: string[]): Promise<InvoicePayment[]> {
    return this.payments.filter((p) => invoiceIds.includes(p.invoiceId));
  }
}
