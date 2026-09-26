import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { InvoiceAllocatedAmountReadPort } from "../../domain/ports/out/invoice-allocated-amount-read.port.js";

interface LinkRow {
  entity_id: string;
  allocated_amount_cents: number;
}

export class SupabaseInvoiceAllocatedAmountReadAdapter implements InvoiceAllocatedAmountReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findAllocatedAmounts(organizationId: OrganizationId, invoiceIds: string[]): Promise<Map<string, number>> {
    if (invoiceIds.length === 0) return new Map();

    const { data, error } = await this.scopedQuery(organizationId)
      .table("bank_movement_entity_links")
      .select("entity_id, allocated_amount_cents")
      .eq("entity_type", "invoice")
      .in("entity_id", invoiceIds);

    if (error) throw new Error(error.message);

    const result = new Map<string, number>();
    for (const row of (data ?? []) as unknown as LinkRow[]) {
      result.set(row.entity_id, (result.get(row.entity_id) ?? 0) + row.allocated_amount_cents);
    }
    return result;
  }
}
