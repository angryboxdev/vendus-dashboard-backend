import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { StockSettingsRepositoryPort } from "../../domain/ports/out/stock-settings-repository.port.js";

export class SupabaseStockSettingsRepository implements StockSettingsRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async getDefaultLocationId(organizationId: OrganizationId): Promise<string | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("stock_settings").select("default_location_id").maybeSingle();
    if (error) throw new Error(error.message);
    return ((data as unknown as { default_location_id: string | null } | null)?.default_location_id) ?? null;
  }

  async setDefaultLocationId(organizationId: OrganizationId, locationId: string | null, actor: string): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("stock_settings")
      .upsert({ default_location_id: locationId, updated_by: actor, updated_at: new Date().toISOString() }, { onConflict: "org_id" });
    if (error) throw new Error(error.message);
  }
}
