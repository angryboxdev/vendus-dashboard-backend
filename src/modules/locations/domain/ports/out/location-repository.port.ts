import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Location } from "../../entities/location.js";

export interface LocationRepositoryPort {
  findAllForOrganization(organizationId: OrganizationId): Promise<Location[]>;
  /**
   * Ownership check: returns the location only if it belongs to
   * `organizationId`, null otherwise. Added for `location-credentials`
   * (spec E D11/D19) — the first consumer outside this module's own read —
   * so "does this organization own this location" has exactly one
   * implementation.
   */
  findOneForOrganization(organizationId: OrganizationId, locationId: string): Promise<Location | null>;
}
