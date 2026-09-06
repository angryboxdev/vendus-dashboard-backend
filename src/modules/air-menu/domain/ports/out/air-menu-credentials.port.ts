import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { AirMenuCredentials } from "../../entities/air-menu-credentials.js";

export type AirMenuCredentialsResult =
  | { status: "found"; credentials: AirMenuCredentials }
  | { status: "not_configured" };

/**
 * Read-only: this is bootstrap-time config resolution (server.ts resolves
 * AirMenu credentials once at process start), not a request-time domain use
 * case — so there is no input port/use-case wrapping this, per the module's
 * README "Design decisions". Writing a row is done by the adapter's own
 * `upsert`, used only by the one-time cutover script
 * (src/jobs/runAirMenuCredentialsCutover.ts), which is not part of this
 * port.
 */
export interface AirMenuCredentialsPort {
  getByOrganization(organizationId: OrganizationId): Promise<AirMenuCredentialsResult>;
}
