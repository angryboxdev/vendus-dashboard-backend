import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { CostCenterCatalog } from "../../domain/entities/cash-flow.js";
import type { CostCenterCatalogReadPort } from "../../domain/ports/out/cost-center-catalog-read.port.js";

/** Catálogo de centros de custo da organização (grupos e categorias, incluindo inativos). */
export class SupabaseCostCenterCatalogReadAdapter implements CostCenterCatalogReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async load(organizationId: OrganizationId): Promise<CostCenterCatalog> {
    const [groups, categories] = await Promise.all([
      this.scopedQuery(organizationId).table("cost_center_groups").select("id, code, name, sort_order"),
      this.scopedQuery(organizationId).table("cost_center_categories").select("id, group_id, code, name"),
    ]);
    if (groups.error) throw new Error(groups.error.message);
    if (categories.error) throw new Error(categories.error.message);

    type GroupRow = { id: string; code: string; name: string; sort_order: number | null };
    type CategoryRow = { id: string; group_id: string; code: string; name: string };
    return {
      groups: ((groups.data ?? []) as unknown as GroupRow[]).map((g) => ({
        id: g.id,
        code: g.code,
        name: g.name,
        sortOrder: g.sort_order ?? 0,
      })),
      categories: ((categories.data ?? []) as unknown as CategoryRow[]).map((c) => ({
        id: c.id,
        groupId: c.group_id,
        code: c.code,
        name: c.name,
      })),
    };
  }
}
