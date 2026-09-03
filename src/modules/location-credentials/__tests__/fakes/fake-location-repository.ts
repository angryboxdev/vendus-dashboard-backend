import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Location } from "../../../locations/domain/entities/location.js";
import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";

export class FakeLocationRepository implements LocationRepositoryPort {
  private readonly byOrganization = new Map<OrganizationId, Location[]>();

  seed(organizationId: OrganizationId, locations: Location[]): void {
    this.byOrganization.set(organizationId, locations);
  }

  async findAllForOrganization(organizationId: OrganizationId): Promise<Location[]> {
    return this.byOrganization.get(organizationId) ?? [];
  }

  async findOneForOrganization(organizationId: OrganizationId, locationId: string): Promise<Location | null> {
    const locations = this.byOrganization.get(organizationId) ?? [];
    return locations.find((l) => l.id === locationId) ?? null;
  }
}
