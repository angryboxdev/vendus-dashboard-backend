import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { LocationToken } from "../../domain/entities/location-token.js";
import type { LocationTokenRepositoryPort } from "../../domain/ports/out/location-token-repository.port.js";

export class FakeLocationTokenRepository implements LocationTokenRepositoryPort {
  private readonly byId = new Map<string, LocationToken>();

  async save(token: LocationToken): Promise<void> {
    this.byId.set(token.id, token);
  }

  async listByLocation(organizationId: OrganizationId, locationId: string): Promise<LocationToken[]> {
    return Array.from(this.byId.values()).filter(
      (t) => t.organizationId === organizationId && t.locationId === locationId,
    );
  }

  async deleteById(organizationId: OrganizationId, tokenId: string): Promise<void> {
    const token = this.byId.get(tokenId);
    if (token && token.organizationId === organizationId) {
      this.byId.delete(tokenId);
    }
  }

  /** Test helper, not part of the port — used to assert on what got saved. */
  all(): LocationToken[] {
    return Array.from(this.byId.values());
  }
}
