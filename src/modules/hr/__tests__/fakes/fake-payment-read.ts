import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { PaymentReadPort } from "../../domain/ports/out/payment-read.port.js";

export class FakePaymentReadAdapter implements PaymentReadPort {
  private readonly unpaidByOrg = new Map<string, number>();

  seedUnpaidCount(organizationId: OrganizationId, count: number): void {
    this.unpaidByOrg.set(String(organizationId), count);
  }

  async countUnpaid(organizationId: OrganizationId): Promise<number> {
    return this.unpaidByOrg.get(String(organizationId)) ?? 0;
  }
}
