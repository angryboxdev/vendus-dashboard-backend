import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { InvoiceAllocation } from "../../domain/entities/invoice-allocation.js";
import type { InvoiceAllocationRepositoryPort } from "../../domain/ports/out/invoice-allocation-repository.port.js";

const COLS = "id, invoice_id, position, description, cost_center_group_id, cost_center_category_id, location_id, net_cents";

function toEntity(r: Record<string, unknown>): InvoiceAllocation {
  return {
    id: r.id as string,
    invoiceId: r.invoice_id as string,
    position: Number(r.position ?? 0),
    description: r.description as string,
    costCenterGroupId: (r.cost_center_group_id as string | null) ?? null,
    costCenterCategoryId: r.cost_center_category_id as string,
    locationId: (r.location_id as string | null) ?? null,
    netCents: Number(r.net_cents),
  };
}

/** Tabela `invoice_allocations` (migração 20261031110000). */
export class SupabaseInvoiceAllocationRepository implements InvoiceAllocationRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findByInvoiceId(organizationId: OrganizationId, invoiceId: string): Promise<InvoiceAllocation[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("invoice_allocations")
      .select(COLS)
      .eq("invoice_id", invoiceId)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(toEntity);
  }

  async findAll(organizationId: OrganizationId): Promise<InvoiceAllocation[]> {
    const { data, error } = await this.scopedQuery(organizationId).table("invoice_allocations").select(COLS);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(toEntity);
  }

  async replaceForInvoice(organizationId: OrganizationId, invoiceId: string, allocations: InvoiceAllocation[]): Promise<void> {
    const del = await this.scopedQuery(organizationId).table("invoice_allocations").delete().eq("invoice_id", invoiceId);
    if (del.error) throw new Error(del.error.message);
    if (allocations.length === 0) return;
    const { error } = await this.scopedQuery(organizationId)
      .table("invoice_allocations")
      .insert(
        allocations.map((a) => ({
          id: a.id,
          invoice_id: invoiceId,
          position: a.position,
          description: a.description,
          cost_center_group_id: a.costCenterGroupId,
          cost_center_category_id: a.costCenterCategoryId,
          location_id: a.locationId,
          net_cents: a.netCents,
        })),
      );
    if (error) throw new Error(error.message);
  }
}
