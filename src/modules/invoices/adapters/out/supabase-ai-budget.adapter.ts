import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { AiBudgetPort, AiFeature } from "../../domain/ports/out/ai-budget.port.js";

/**
 * Contagem em `ai_usage_daily` (dia UTC). Ler-somar-gravar não é atómico: pedidos simultâneos
 * podem passar o limite por uma ou duas chamadas — aceitável para um orçamento.
 */
export class SupabaseAiBudgetAdapter implements AiBudgetPort {
  constructor(
    private readonly scopedQuery: ScopedQueryFactory,
    private readonly dailyLimit: number,
    private readonly today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {}

  async consume(organizationId: OrganizationId, feature: AiFeature) {
    const day = this.today();
    const { data, error } = await this.scopedQuery(organizationId).table("ai_usage_daily").select("feature, calls").eq("day", day);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as { feature: string; calls: number }[];
    const used = rows.reduce((acc, r) => acc + Number(r.calls), 0);
    if (used >= this.dailyLimit) return { allowed: false, used, limit: this.dailyLimit };
    const current = Number(rows.find((r) => r.feature === feature)?.calls ?? 0);
    const { error: upsertError } = await this.scopedQuery(organizationId)
      .table("ai_usage_daily")
      .upsert({ day, feature, calls: current + 1, updated_at: new Date().toISOString() }, { onConflict: "org_id,day,feature" });
    if (upsertError) throw new Error(upsertError.message);
    return { allowed: true, used: used + 1, limit: this.dailyLimit };
  }
}
