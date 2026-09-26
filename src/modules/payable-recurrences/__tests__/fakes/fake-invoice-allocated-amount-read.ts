import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { InvoiceAllocatedAmountReadPort } from "../../domain/ports/out/invoice-allocated-amount-read.port.js";

function key(organizationId: OrganizationId, invoiceId: string): string {
  return `${organizationId}:${invoiceId}`;
}

export class FakeInvoiceAllocatedAmountReadAdapter implements InvoiceAllocatedAmountReadPort {
  private amounts = new Map<string, number>();

  seedAllocatedAmount(organizationId: OrganizationId, invoiceId: string, amountCents: number): void {
    this.amounts.set(key(organizationId, invoiceId), amountCents);
  }

  async findAllocatedAmounts(organizationId: OrganizationId, invoiceIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    for (const id of invoiceIds) {
      const amount = this.amounts.get(key(organizationId, id));
      if (amount != null) result.set(id, amount);
    }
    return result;
  }
}
