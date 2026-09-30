import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { StockCountSignalReadPort, StockCountSignalSnapshot } from "../../domain/ports/out/stock-count-signal-read.port.js";

/**
 * Lê `stock_count_sessions`/`stock_count_lines`/`stock_count_settings`
 * (tabelas do módulo `stock-count`) diretamente por `ScopedQuery` — ver o
 * port para o porquê de não passar por um port exportado desse módulo.
 */
export class StockCountSignalReadAdapter implements StockCountSignalReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async getSignalForItem(organizationId: OrganizationId, stockItemId: string): Promise<StockCountSignalSnapshot> {
    const [lastCountResult, settingsResult] = await Promise.all([
      this.findLastCompletedCountAt(organizationId, stockItemId),
      this.scopedQuery(organizationId).table("stock_count_settings").select("slow_moving_days_threshold").maybeSingle(),
    ]);

    if (settingsResult.error) throw new Error(settingsResult.error.message);
    const settingsRow = settingsResult.data as unknown as { slow_moving_days_threshold: number | null } | null;

    return {
      lastCompletedCountAt: lastCountResult,
      slowMovingDaysThreshold: settingsRow?.slow_moving_days_threshold ?? null,
    };
  }

  private async findLastCompletedCountAt(organizationId: OrganizationId, stockItemId: string): Promise<Date | null> {
    const { data: lineRows, error: lineError } = await this.scopedQuery(organizationId)
      .table("stock_count_lines")
      .select("session_id, created_at")
      .eq("item_id", stockItemId)
      .in("status", ["counted", "resolved"]);
    if (lineError) throw new Error(lineError.message);
    const sessionIds = [...new Set(((lineRows ?? []) as unknown as { session_id: string }[]).map((r) => r.session_id))];
    if (sessionIds.length === 0) return null;

    const { data: sessionRows, error: sessionError } = await this.scopedQuery(organizationId)
      .table("stock_count_sessions")
      .select("approved_at")
      .in("id", sessionIds)
      .eq("status", "completed")
      .order("approved_at", { ascending: false })
      .limit(1);
    if (sessionError) throw new Error(sessionError.message);
    const rows = (sessionRows ?? []) as unknown as { approved_at: string | null }[];
    const approvedAt = rows[0]?.approved_at;
    return approvedAt ? new Date(approvedAt) : null;
  }
}
