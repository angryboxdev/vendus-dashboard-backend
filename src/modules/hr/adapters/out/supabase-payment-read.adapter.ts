import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { PaymentReadPort } from "../../domain/ports/out/payment-read.port.js";

export class SupabasePaymentReadAdapter implements PaymentReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async countUnpaid(organizationId: OrganizationId): Promise<number> {
    const { count, error } = await this.scopedQuery(organizationId)
      .table("hr_employee_payments")
      .select("id", { count: "exact", head: true })
      .eq("is_paid", false);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }
}
