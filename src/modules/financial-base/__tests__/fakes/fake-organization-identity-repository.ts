import type { OrganizationIdentity } from "../../domain/entities/organization-identity.js";
import type { OrganizationIdentityPort } from "../../domain/ports/out/organization-identity.port.js";

export class FakeOrganizationIdentityRepository implements OrganizationIdentityPort {
  private readonly store = new Map<string, OrganizationIdentity>();

  async findById(orgId: string): Promise<OrganizationIdentity | null> {
    return this.store.get(orgId) ?? null;
  }

  seed(organization: OrganizationIdentity): void {
    this.store.set(organization.id, organization);
  }
}
