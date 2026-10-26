import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { RecurrenceCategoryHintPort } from "../../domain/ports/out/recurrence-category-hint.port.js";

/** Cross-módulo: lê `recurring_contracts` diretamente (só nome e sub-categoria), sem importar o módulo de recorrências. */
export class SupabaseRecurrenceCategoryHintAdapter implements RecurrenceCategoryHintPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async forSupplier(organizationId: OrganizationId, supplierId: string): Promise<{ categoryId: string; recurrenceName: string } | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("recurring_contracts")
      .select("name, cost_center_category_id")
      .eq("supplier_id", supplierId)
      .eq("status", "active")
      .not("cost_center_category_id", "is", null);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as { name: string; cost_center_category_id: string }[];
    const categories = new Set(rows.map((r) => r.cost_center_category_id));
    if (categories.size !== 1) return null;
    return { categoryId: rows[0]!.cost_center_category_id, recurrenceName: rows[0]!.name };
  }
}
