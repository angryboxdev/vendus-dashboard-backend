import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { DefaultStockPolicy } from "../../domain/entities/supplier.js";
import type { SupplierLocationRule } from "../../domain/entities/supplier-location-rule.js";
import type { SupplierLocationRuleRepositoryPort } from "../../domain/ports/out/supplier-location-rule-repository.port.js";

const COLS = "id, supplier_id, location_id, stock_policy, cost_center_group_id, cost_center_category_id, created_by, created_at, updated_at";

function toEntity(r: Record<string, unknown>): SupplierLocationRule {
  return {
    id: r.id as string,
    supplierId: r.supplier_id as string,
    locationId: r.location_id as string,
    stockPolicy: (r.stock_policy as DefaultStockPolicy | null) ?? null,
    costCenterGroupId: (r.cost_center_group_id as string | null) ?? null,
    costCenterCategoryId: (r.cost_center_category_id as string | null) ?? null,
    createdBy: r.created_by as string,
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
  };
}

/** Tabela `supplier_location_rules` (migração 20261031100000). */
export class SupabaseSupplierLocationRuleRepository implements SupplierLocationRuleRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async listBySupplier(organizationId: OrganizationId, supplierId: string): Promise<SupplierLocationRule[]> {
    const { data, error } = await this.scopedQuery(organizationId).table("supplier_location_rules").select(COLS).eq("supplier_id", supplierId);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(toEntity);
  }

  async upsert(organizationId: OrganizationId, rule: SupplierLocationRule): Promise<SupplierLocationRule> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("supplier_location_rules")
      .upsert(
        {
          supplier_id: rule.supplierId,
          location_id: rule.locationId,
          stock_policy: rule.stockPolicy,
          cost_center_group_id: rule.costCenterGroupId,
          cost_center_category_id: rule.costCenterCategoryId,
          created_by: rule.createdBy,
          updated_at: rule.updatedAt.toISOString(),
        },
        { onConflict: "org_id,supplier_id,location_id" },
      )
      .select(COLS)
      .single();
    if (error) throw new Error(error.message);
    return toEntity(data as unknown as Record<string, unknown>);
  }

  async delete(organizationId: OrganizationId, supplierId: string, locationId: string): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("supplier_location_rules").delete().eq("supplier_id", supplierId).eq("location_id", locationId);
    if (error) throw new Error(error.message);
  }
}
