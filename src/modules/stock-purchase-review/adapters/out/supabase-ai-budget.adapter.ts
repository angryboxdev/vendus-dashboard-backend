import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { StockAiBudgetPort } from "../../domain/ports/out/ai-budget.port.js";

/** Mesma contagem que o leitor de faturas (`ai_usage_daily`, dia UTC, total de todas as funcionalidades). */
export class SupabaseStockAiBudgetAdapter implements StockAiBudgetPort {
  constructor(
    private readonly scopedQuery: ScopedQueryFactory,
    private readonly dailyLimit: number,
  ) {}

  async consume(organizationId: OrganizationId, feature: "stock_match") {
    const day = new Date().toISOString().slice(0, 10);
    const { data, error } = await this.scopedQuery(organizationId).table("ai_usage_daily").select("feature, calls").eq("day", day);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as { feature: string; calls: number }[];
    if (rows.reduce((acc, r) => acc + Number(r.calls), 0) >= this.dailyLimit) return { allowed: false };
    const current = Number(rows.find((r) => r.feature === feature)?.calls ?? 0);
    const { error: upsertError } = await this.scopedQuery(organizationId)
      .table("ai_usage_daily")
      .upsert({ day, feature, calls: current + 1, updated_at: new Date().toISOString() }, { onConflict: "org_id,day,feature" });
    if (upsertError) throw new Error(upsertError.message);
    return { allowed: true };
  }
}
