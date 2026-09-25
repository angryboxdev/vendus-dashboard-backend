import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface OrganizationIdentityReadPort {
  /** Returns the organization's own tax id (NIF), or null if not configured. */
  getNif(organizationId: OrganizationId): Promise<string | null>;
}
