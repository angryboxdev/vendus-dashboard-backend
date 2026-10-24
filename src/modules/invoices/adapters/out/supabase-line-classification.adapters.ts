import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { CategoryCatalogReadPort, ConfirmedLineHistoryPort } from "../../domain/ports/out/line-classification.ports.js";
import type { CatalogEntry, ConfirmedLine } from "../../domain/services/classification/line-classifier.js";

/** Catálogo de Categorias (grupos) e Subcategorias da organização — lido diretamente, sem importar `financial-base` (D10). */
export class SupabaseCategoryCatalogAdapter implements CategoryCatalogReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async list(organizationId: OrganizationId): Promise<CatalogEntry[]> {
    const [cats, groups] = await Promise.all([
      this.scopedQuery(organizationId).table("cost_center_categories").select("id, group_id, code, name, is_active"),
      this.scopedQuery(organizationId).table("cost_center_groups").select("id, name, is_active"),
    ]);
    if (cats.error) throw new Error(cats.error.message);
    if (groups.error) throw new Error(groups.error.message);
    const groupById = new Map(((groups.data ?? []) as unknown as { id: string; name: string; is_active: boolean }[]).map((g) => [g.id, g]));
    return ((cats.data ?? []) as unknown as { id: string; group_id: string; code: string; name: string; is_active: boolean }[]).map((c) => {
      const g = groupById.get(c.group_id);
      return { id: c.id, code: c.code, name: c.name, groupName: g?.name ?? "", isActive: c.is_active && (g?.is_active ?? true) };
    });
  }
}

const CONFIRMED_STATUSES = ["pending", "paid", "overdue", "review"];

/**
 * Linhas de faturas confirmadas (nunca rascunhos nem canceladas) do fornecedor,
 * com subcategoria — a «memória» da classificação. Mais recentes primeiro.
 */
export class SupabaseConfirmedLineHistoryAdapter implements ConfirmedLineHistoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async forSupplier(organizationId: OrganizationId, supplierId: string, limit: number): Promise<ConfirmedLine[]> {
    const inv = await this.scopedQuery(organizationId)
      .table("invoices")
      .select("id")
      .eq("supplier_id", supplierId)
      .in("status", CONFIRMED_STATUSES)
      .order("invoice_date", { ascending: false })
      .limit(100);
    if (inv.error) throw new Error(inv.error.message);
    const ids = ((inv.data ?? []) as unknown as { id: string }[]).map((r) => r.id);
    if (!ids.length) return [];
    const lines = await this.scopedQuery(organizationId)
      .table("invoice_lines")
      .select("description, supplier_item_code, cost_center_category_id")
      .in("invoice_id", ids)
      .not("cost_center_category_id", "is", null)
      .limit(limit);
    if (lines.error) throw new Error(lines.error.message);
    return ((lines.data ?? []) as unknown as { description: string; supplier_item_code: string | null; cost_center_category_id: string }[]).map((l) => ({
      supplierCode: l.supplier_item_code,
      description: l.description,
      categoryId: l.cost_center_category_id,
    }));
  }
}
