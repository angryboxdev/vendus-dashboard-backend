import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { AirMenuLocationConfig } from "../../domain/entities/air-menu-location-config.js";
import type {
  AirMenuLocationConfigPort,
  AirMenuLocationConfigResult,
} from "../../domain/ports/out/air-menu-location-config.port.js";

/**
 * `getByLocation` implements the read-only port. `upsert` is additional
 * surface for the cutover script only — see the sibling credentials
 * adapter's comment.
 */
export class SupabaseAirMenuLocationConfigRepository implements AirMenuLocationConfigPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async getByLocation(organizationId: OrganizationId, locationId: string): Promise<AirMenuLocationConfigResult> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("airmenu_location_config")
      .select("closing_enterprise_id")
      .eq("location_id", locationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { status: "not_configured" };

    const row = data as unknown as { closing_enterprise_id: string };
    return { status: "found", config: { closingEnterpriseId: row.closing_enterprise_id } };
  }

  async upsert(organizationId: OrganizationId, locationId: string, config: AirMenuLocationConfig): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("airmenu_location_config")
      .upsert(
        {
          location_id: locationId,
          closing_enterprise_id: config.closingEnterpriseId,
        },
        { onConflict: "org_id,location_id" },
      );
    if (error) throw new Error(error.message);
  }
}
