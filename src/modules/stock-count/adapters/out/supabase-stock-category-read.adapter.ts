import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { StockCategoryReadPort, StockCategorySnapshot } from "../../domain/ports/out/stock-category-read.port.js";
import type { TolerancePolicy } from "../../domain/services/tolerance.service.js";

interface Row {
  id: string;
  name: string;
  tolerance_absolute_qty: number | null;
  tolerance_percent: number | null;
  tolerance_financial_impact: number | null;
}

function toTolerance(row: Row): TolerancePolicy | null {
  const t: TolerancePolicy = {
    absoluteQty: row.tolerance_absolute_qty != null ? Number(row.tolerance_absolute_qty) : null,
    percent: row.tolerance_percent != null ? Number(row.tolerance_percent) : null,
    financialImpact: row.tolerance_financial_impact != null ? Number(row.tolerance_financial_impact) : null,
  };
  return t.absoluteQty != null || t.percent != null || t.financialImpact != null ? t : null;
}

const SELECT = "id, name, tolerance_absolute_qty, tolerance_percent, tolerance_financial_impact";

/**
 * Adapter direto à tabela LEGACY `stock_categories` — nunca via
 * `stockCategoryService.ts` (CLAUDE.md). Nunca um D10 sobre
 * `financial-base`: Centro de Custo é um conceito diferente, não
 * relacionado com stock físico (ver README).
 */
export class SupabaseStockCategoryReadAdapter implements StockCategoryReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findById(organizationId: OrganizationId, categoryId: string): Promise<StockCategorySnapshot | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("stock_categories").select(SELECT).eq("id", categoryId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as unknown as Row;
    return { id: row.id, name: row.name, tolerance: toTolerance(row) };
  }

  async listAll(organizationId: OrganizationId): Promise<StockCategorySnapshot[]> {
    const { data, error } = await this.scopedQuery(organizationId).table("stock_categories").select(SELECT).order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map((row) => ({ id: row.id, name: row.name, tolerance: toTolerance(row) }));
  }
}
