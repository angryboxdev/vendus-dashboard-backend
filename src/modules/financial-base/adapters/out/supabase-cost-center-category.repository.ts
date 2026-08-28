import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { CostCenterCategory, type FinancialType } from "../../domain/entities/cost-center-category.js";
import type {
  CostCenterCategoryFilter,
  CostCenterCategoryRepositoryPort,
} from "../../domain/ports/out/cost-center-category-repository.port.js";

function toEntity(row: Record<string, unknown>): CostCenterCategory {
  return CostCenterCategory.reconstitute({
    id: row.id as string,
    groupId: row.group_id as string,
    code: row.code as string,
    name: row.name as string,
    financialType: row.financial_type as FinancialType,
    affectsDre: Boolean(row.affects_dre),
    affectsCashflow: Boolean(row.affects_cashflow),
    affectsProfitability: Boolean(row.affects_profitability),
    requiresChannel: Boolean(row.requires_channel),
    requiresAllocation: Boolean(row.requires_allocation),
    isActive: Boolean(row.is_active),
    description: (row.description as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });
}

/**
 * Nunca guarda um `SupabaseClient` — recebe o factory `createScopedQuery`
 * (`ScopedQueryFactory`) injectado pelo composition root e constrói um
 * `ScopedQuery` por chamada (D2).
 */
export class SupabaseCostCenterCategoryRepository implements CostCenterCategoryRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async save(organizationId: OrganizationId, category: CostCenterCategory): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("cost_center_categories").insert({
      id: category.id,
      group_id: category.groupId,
      code: category.code,
      name: category.name,
      financial_type: category.financialType,
      affects_dre: category.affectsDre,
      affects_cashflow: category.affectsCashflow,
      affects_profitability: category.affectsProfitability,
      requires_channel: category.requiresChannel,
      requires_allocation: category.requiresAllocation,
      is_active: category.isActive,
      description: category.description,
      created_at: category.createdAt.toISOString(),
      updated_at: category.updatedAt.toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<CostCenterCategory | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("cost_center_categories")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as unknown as Record<string, unknown>);
  }

  async findByCode(organizationId: OrganizationId, code: string): Promise<CostCenterCategory | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("cost_center_categories")
      .select("*")
      .eq("code", code.trim().toUpperCase())
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as unknown as Record<string, unknown>);
  }

  async findByGroupId(organizationId: OrganizationId, groupId: string): Promise<CostCenterCategory[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("cost_center_categories")
      .select("*")
      .eq("group_id", groupId)
      .order("code", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => toEntity(r));
  }

  async findAll(
    organizationId: OrganizationId,
    filter?: CostCenterCategoryFilter,
  ): Promise<CostCenterCategory[]> {
    let q = this.scopedQuery(organizationId)
      .table("cost_center_categories")
      .select("*")
      .order("code", { ascending: true });

    if (filter?.groupId) q = q.eq("group_id", filter.groupId);
    if (filter?.isActive !== undefined) q = q.eq("is_active", filter.isActive);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => toEntity(r));
  }

  async update(organizationId: OrganizationId, category: CostCenterCategory): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("cost_center_categories")
      .update({
        name: category.name,
        financial_type: category.financialType,
        affects_dre: category.affectsDre,
        affects_cashflow: category.affectsCashflow,
        affects_profitability: category.affectsProfitability,
        requires_channel: category.requiresChannel,
        requires_allocation: category.requiresAllocation,
        is_active: category.isActive,
        description: category.description,
        updated_at: category.updatedAt.toISOString(),
      })
      .eq("id", category.id);
    if (error) throw new Error(error.message);
  }
}
