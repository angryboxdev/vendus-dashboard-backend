import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { MenuCostingSettingsRepositoryPort } from "../../domain/ports/out/menu-costing-settings.port.js";

export class SupabaseMenuCostingSettingsRepository implements MenuCostingSettingsRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async getSalesVatRate(organizationId: OrganizationId): Promise<number | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("menu_costing_settings").select("sales_vat_rate").maybeSingle();
    if (error) throw new Error(error.message);
    const raw = (data as unknown as { sales_vat_rate: number | string | null } | null)?.sales_vat_rate;
    return raw == null ? null : Number(raw);
  }

  async setSalesVatRate(organizationId: OrganizationId, rate: number, actor: string): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("menu_costing_settings")
      .upsert({ sales_vat_rate: rate, updated_by: actor, updated_at: new Date().toISOString() }, { onConflict: "org_id" });
    if (error) throw new Error(error.message);
  }
}
