import type { AnalyticsCachePort, CachedMonthRow } from "../../domain/ports/out/analytics-cache.port.js";
import { getSupabaseServiceRole } from "../../../../infra/supabaseClient.js";

/**
 * Persiste métricas mensais Vendus na tabela `analytics_monthly_cache` do Supabase.
 * Falhas de leitura/escrita são não-fatais — o use case degrada para re-fetch da API.
 */
export class SupabaseAnalyticsCacheAdapter implements AnalyticsCachePort {
  async getMonths(years: number[]): Promise<CachedMonthRow[]> {
    if (years.length === 0) return [];
    try {
      const sb = getSupabaseServiceRole();
      if (!sb) return [];
      const { data } = await sb
        .from("analytics_monthly_cache")
        .select("year, month, gross_cents, documents_count")
        .in("year", years);
      return (data ?? []).map((row) => ({
        year: row.year as number,
        month: row.month as number,
        gross_cents: Number(row.gross_cents),
        documents_count: row.documents_count as number,
      }));
    } catch (e) {
      console.error("[SupabaseAnalyticsCacheAdapter] getMonths failed (non-fatal):", e);
      return [];
    }
  }

  async saveMonths(rows: CachedMonthRow[]): Promise<void> {
    if (rows.length === 0) return;
    try {
      const sb = getSupabaseServiceRole();
      if (!sb) return;
      await sb.from("analytics_monthly_cache").upsert(rows, { onConflict: "org_id,year,month" });
    } catch (e) {
      console.error("[SupabaseAnalyticsCacheAdapter] saveMonths failed (non-fatal):", e);
    }
  }
}
