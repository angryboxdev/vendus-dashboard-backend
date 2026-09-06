import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { VendusLocationConfig } from "../../entities/vendus-location-config.js";

/**
 * A missing row means "this location has no Vendus register/price-group
 * config" — same not-configured convention as `VendusCredentialsResult`.
 */
export type VendusLocationConfigResult =
  | { status: "configured"; config: VendusLocationConfig }
  | { status: "not_configured" };

/** Implemented by `SupabaseVendusLocationConfigAdapter` (adapters/out). */
export interface VendusLocationConfigPort {
  getByOrganizationAndLocation(
    organizationId: OrganizationId,
    locationId: string,
  ): Promise<VendusLocationConfigResult>;
  save(organizationId: OrganizationId, locationId: string, config: VendusLocationConfig): Promise<void>;
}
