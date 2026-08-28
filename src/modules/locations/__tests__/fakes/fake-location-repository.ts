import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { Location } from "../../domain/entities/location.js";
import type { LocationRepositoryPort } from "../../domain/ports/out/location-repository.port.js";

export class FakeLocationRepository implements LocationRepositoryPort {
  private readonly byOrganization = new Map<OrganizationId, Location[]>();

  seed(organizationId: OrganizationId, locations: Location[]): void {
    this.byOrganization.set(organizationId, locations);
  }

  async findAllForOrganization(organizationId: OrganizationId): Promise<Location[]> {
    return this.byOrganization.get(organizationId) ?? [];
  }
}
