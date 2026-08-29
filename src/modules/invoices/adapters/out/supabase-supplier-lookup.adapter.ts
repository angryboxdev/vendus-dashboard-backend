import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { SupplierLookupPort, SupplierSummary } from "../../domain/ports/out/supplier-lookup.port.js";

function toSummary(row: Record<string, unknown>): SupplierSummary {
  return {
    id: row.id as string,
    name: row.name as string,
    nif: (row.nif as string | null) ?? null,
    defaultCostCenterGroupId: (row.default_cost_center_group_id as string | null) ?? null,
    defaultCostCenterCategoryId: (row.default_cost_center_category_id as string | null) ?? null,
    defaultFinancialType: (row.default_financial_type as string | null) ?? null,
  };
}

/**
 * Nunca guarda um `SupabaseClient` — recebe o factory `createScopedQuery`
 * (`ScopedQueryFactory`) injectado pelo composition root e constrói um
 * `ScopedQuery` por chamada (D2).
 */
export class SupabaseSupplierLookupAdapter implements SupplierLookupPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findByNif(organizationId: OrganizationId, nif: string): Promise<SupplierSummary | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("suppliers")
      .select("id, name, nif, default_cost_center_group_id, default_cost_center_category_id, default_financial_type")
      .eq("nif", nif)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return toSummary(data as unknown as Record<string, unknown>);
  }

  async findByName(organizationId: OrganizationId, query: string): Promise<SupplierSummary[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("suppliers")
      .select("id, name, nif, default_cost_center_group_id, default_cost_center_category_id, default_financial_type")
      .ilike("name", `%${query}%`)
      .limit(10);

    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => toSummary(r));
  }

  async findAll(organizationId: OrganizationId): Promise<SupplierSummary[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("suppliers")
      .select("id, name, nif, default_cost_center_group_id, default_cost_center_category_id, default_financial_type");

    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => toSummary(r));
  }
}
