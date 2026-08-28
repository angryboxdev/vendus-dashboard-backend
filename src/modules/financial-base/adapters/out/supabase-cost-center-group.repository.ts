import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { CostCenterGroup } from "../../domain/entities/cost-center-group.js";
import type {
  CostCenterGroupFilter,
  CostCenterGroupRepositoryPort,
} from "../../domain/ports/out/cost-center-group-repository.port.js";

function toEntity(row: Record<string, unknown>): CostCenterGroup {
  return CostCenterGroup.reconstitute({
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    isActive: Boolean(row.is_active),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });
}

/**
 * Nunca guarda um `SupabaseClient` — recebe o factory `createScopedQuery`
 * (`ScopedQueryFactory`) injectado pelo composition root e constrói um
 * `ScopedQuery` por chamada (D2).
 */
export class SupabaseCostCenterGroupRepository implements CostCenterGroupRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async save(organizationId: OrganizationId, group: CostCenterGroup): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("cost_center_groups").insert({
      id: group.id,
      code: group.code,
      name: group.name,
      description: group.description,
      sort_order: group.sortOrder,
      is_active: group.isActive,
      created_at: group.createdAt.toISOString(),
      updated_at: group.updatedAt.toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<CostCenterGroup | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("cost_center_groups")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as unknown as Record<string, unknown>);
  }

  async findByCode(organizationId: OrganizationId, code: string): Promise<CostCenterGroup | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("cost_center_groups")
      .select("*")
      .eq("code", code.trim().toUpperCase())
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as unknown as Record<string, unknown>);
  }

  async findAll(
    organizationId: OrganizationId,
    filter?: CostCenterGroupFilter,
  ): Promise<CostCenterGroup[]> {
    let q = this.scopedQuery(organizationId)
      .table("cost_center_groups")
      .select("*")
      .order("sort_order", { ascending: true });

    if (filter?.isActive !== undefined) q = q.eq("is_active", filter.isActive);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => toEntity(r));
  }

  async update(organizationId: OrganizationId, group: CostCenterGroup): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("cost_center_groups")
      .update({
        name: group.name,
        description: group.description,
        sort_order: group.sortOrder,
        is_active: group.isActive,
        updated_at: group.updatedAt.toISOString(),
      })
      .eq("id", group.id);
    if (error) throw new Error(error.message);
  }
}
