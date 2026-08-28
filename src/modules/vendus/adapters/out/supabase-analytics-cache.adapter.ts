import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { AnalyticsCachePort, CachedMonthRow } from "../../domain/ports/out/analytics-cache.port.js";

/**
 * Persiste métricas mensais Vendus na tabela `analytics_monthly_cache` do Supabase.
 * Falhas de leitura/escrita são não-fatais — o use case degrada para re-fetch da API.
 *
 * Never holds a `SupabaseClient` — receives the scoped-query factory at
 * composition time (D2) and builds a scoped helper per call, per the
 * pattern bank-accounts establishes (see the module README's Ports
 * section). This is the module's only output port that queries Supabase —
 * the other two output ports talk to the Vendus HTTP API / an in-memory
 * cache and stay unscoped.
 */
export class SupabaseAnalyticsCacheAdapter implements AnalyticsCachePort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async getMonths(organizationId: OrganizationId, years: number[]): Promise<CachedMonthRow[]> {
    if (years.length === 0) return [];
    try {
      const { data } = await this.scopedQuery(organizationId)
        .table("analytics_monthly_cache")
        .select("year, month, gross_cents, documents_count")
        .in("year", years);
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
        year: row["year"] as number,
        month: row["month"] as number,
        gross_cents: Number(row["gross_cents"]),
        documents_count: row["documents_count"] as number,
      }));
    } catch (e) {
      console.error("[SupabaseAnalyticsCacheAdapter] getMonths failed (non-fatal):", e);
      return [];
    }
  }

  async saveMonths(organizationId: OrganizationId, rows: CachedMonthRow[]): Promise<void> {
    if (rows.length === 0) return;
    try {
      await this.scopedQuery(organizationId)
        .table("analytics_monthly_cache")
        .upsert(rows as unknown as Record<string, unknown>[], { onConflict: "org_id,year,month" });
    } catch (e) {
      console.error("[SupabaseAnalyticsCacheAdapter] saveMonths failed (non-fatal):", e);
    }
  }
}
