import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { VendusCredentials } from "../../entities/vendus-credentials.js";

/**
 * A missing row is the normal, expected way to say "this organization has no
 * Vendus integration configured" — mirrors this codebase's established
 * "not configured" convention (src/utils/fan-out.ts's
 * `FanOutProcessorResult`), not a thrown error or a nullable return.
 */
export type VendusCredentialsResult =
  | { status: "configured"; credentials: VendusCredentials }
  | { status: "not_configured" };

/**
 * Implemented by `SupabaseVendusCredentialsAdapter` (adapters/out). The API
 * key is stored encrypted at rest — this port always deals in the decrypted
 * value; encryption is the adapter's concern (ticket 01's helper).
 */
export interface VendusCredentialsPort {
  getByOrganization(organizationId: OrganizationId): Promise<VendusCredentialsResult>;
  save(organizationId: OrganizationId, credentials: VendusCredentials): Promise<void>;
}
