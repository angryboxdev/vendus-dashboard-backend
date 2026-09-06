import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type {
  SalesSummaryCachePort,
  SaveCacheParams,
  MonthlyGrowthRow,
} from "../../domain/ports/out/sales-summary-cache.port.js";
import type { SalesSummaryResult } from "../../domain/entities/sales-summary.js";

/**
 * Persists SalesSummaryResult in the `sales_summary_cache` table.
 *
 * Never holds a SupabaseClient — receives the scoped-query factory at
 * composition time (D2 pattern), matching SupabaseAnalyticsCacheAdapter.
 */
export class SupabaseSalesSummaryCacheAdapter implements SalesSummaryCachePort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async get(
    organizationId: OrganizationId,
    year: number,
    month: number,
  ): Promise<{ payload: SalesSummaryResult; calculatedAt: Date } | null> {
    try {
      const { data } = await this.scopedQuery(organizationId)
        .table("sales_summary_cache")
        .select("payload, calculated_at")
        .eq("year", year)
        .eq("month", month)
        .maybeSingle();

      if (!data) return null;

      const row = data as unknown as { payload: SalesSummaryResult; calculated_at: string };
      const calculatedAt = new Date(row.calculated_at);

      return { payload: row.payload, calculatedAt };
    } catch (e) {
      console.error("[SupabaseSalesSummaryCacheAdapter] get failed (non-fatal):", e);
      return null;
    }
  }

  async save(
    organizationId: OrganizationId,
    year: number,
    month: number,
    params: SaveCacheParams,
  ): Promise<void> {
    try {
      const totalRevenueCents = params.payload.totals.grossRevenue;
      await this.scopedQuery(organizationId)
        .table("sales_summary_cache")
        .upsert(
          {
            year,
            month,
            payload: params.payload as unknown as Record<string, unknown>,
            total_revenue_cents: totalRevenueCents,
            vendus_revenue_cents: params.vendusRevenueCents,
            air_menu_revenue_cents: params.airMenuRevenueCents,
            calculated_at: new Date().toISOString(),
          },
          { onConflict: "org_id,year,month" },
        );
    } catch (e) {
      console.error("[SupabaseSalesSummaryCacheAdapter] save failed (non-fatal):", e);
    }
  }

  async getYearMonths(
    organizationId: OrganizationId,
    year: number,
  ): Promise<MonthlyGrowthRow[]> {
    try {
      const { data } = await this.scopedQuery(organizationId)
        .table("sales_summary_cache")
        .select("year, month, total_revenue_cents, vendus_revenue_cents, air_menu_revenue_cents, calculated_at")
        .eq("year", year);

      return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
        year: row["year"] as number,
        month: row["month"] as number,
        totalRevenueCents: Number(row["total_revenue_cents"]),
        vendusRevenueCents: Number(row["vendus_revenue_cents"]),
        airMenuRevenueCents: Number(row["air_menu_revenue_cents"]),
        calculatedAt: new Date(row["calculated_at"] as string),
      }));
    } catch (e) {
      console.error("[SupabaseSalesSummaryCacheAdapter] getYearMonths failed (non-fatal):", e);
      return [];
    }
  }
}
