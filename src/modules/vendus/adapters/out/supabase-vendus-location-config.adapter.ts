import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type {
  VendusLocationConfigPort,
  VendusLocationConfigResult,
} from "../../domain/ports/out/vendus-location-config.port.js";
import type { VendusLocationConfig } from "../../domain/entities/vendus-location-config.js";

/**
 * Reads/writes `vendus_location_config` (one row per `org_id, location_id`).
 * Plain columns — nothing here is encrypted (register id and price-group/
 * payment-method ids are not secrets).
 *
 * `location_id` is stamped explicitly on `save()`, not by `ScopedQuery`
 * (which only stamps the organization column) — same convention as
 * `SupabaseCashClosingRepository`.
 */
export class SupabaseVendusLocationConfigAdapter implements VendusLocationConfigPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async getByOrganizationAndLocation(
    organizationId: OrganizationId,
    locationId: string,
  ): Promise<VendusLocationConfigResult> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("vendus_location_config")
      .select("register_id, eatz_payment_id, apps_payment_id, salao_price_group_id, eatz_price_group_id")
      .eq("location_id", locationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { status: "not_configured" };

    const row = data as unknown as Record<string, unknown>;
    return {
      status: "configured",
      config: {
        registerId: row["register_id"] as string,
        eatzPaymentId: row["eatz_payment_id"] as number,
        appsPaymentId: row["apps_payment_id"] as number,
        salaoPriceGroupId: row["salao_price_group_id"] as number,
        eatzPriceGroupId: row["eatz_price_group_id"] as number,
      },
    };
  }

  async save(
    organizationId: OrganizationId,
    locationId: string,
    config: VendusLocationConfig,
  ): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("vendus_location_config")
      .upsert(
        {
          location_id: locationId,
          register_id: config.registerId,
          eatz_payment_id: config.eatzPaymentId,
          apps_payment_id: config.appsPaymentId,
          salao_price_group_id: config.salaoPriceGroupId,
          eatz_price_group_id: config.eatzPriceGroupId,
        },
        { onConflict: "org_id,location_id" },
      );
    if (error) throw new Error(error.message);
  }
}
