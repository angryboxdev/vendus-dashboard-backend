import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { InvoiceReconciliationWritePort } from "../../domain/ports/out/invoice-reconciliation-write.port.js";

export class FakeInvoiceReconciliationWrite implements InvoiceReconciliationWritePort {
  readonly reconciledCalls: { invoiceId: string; movementDate: Date }[] = [];
  readonly partialCalls: string[] = [];
  readonly unreconciledCalls: string[] = [];

  async markReconciled(
    _organizationId: OrganizationId,
    invoiceId: string,
    movementDate: Date
  ): Promise<void> {
    this.reconciledCalls.push({ invoiceId, movementDate });
  }

  async markPartiallyReconciled(_organizationId: OrganizationId, invoiceId: string): Promise<void> {
    this.partialCalls.push(invoiceId);
  }

  async markUnreconciled(_organizationId: OrganizationId, invoiceId: string): Promise<void> {
    this.unreconciledCalls.push(invoiceId);
  }

  reset(): void {
    this.reconciledCalls.length = 0;
    this.partialCalls.length = 0;
    this.unreconciledCalls.length = 0;
  }
}
