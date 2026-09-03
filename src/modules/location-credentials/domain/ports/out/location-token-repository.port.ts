import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { LocationToken } from "../../entities/location-token.js";

export interface LocationTokenRepositoryPort {
  save(token: LocationToken): Promise<void>;
  listByLocation(organizationId: OrganizationId, locationId: string): Promise<LocationToken[]>;
  /**
   * Scoped by organizationId, not just id: an admin can never delete
   * another organization's token even by guessing its id (story 10).
   * Deleting one row is the whole revocation mechanism — no sibling token
   * at the same location is touched (D4).
   */
  deleteById(organizationId: OrganizationId, tokenId: string): Promise<void>;
}
