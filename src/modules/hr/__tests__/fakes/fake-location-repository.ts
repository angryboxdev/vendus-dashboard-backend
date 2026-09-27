import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Location } from "../../../locations/domain/entities/location.js";
import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";

export class FakeLocationRepository implements LocationRepositoryPort {
  private readonly byOrganization = new Map<string, Location[]>();

  seed(organizationId: OrganizationId, locations: Location[]): void {
    this.byOrganization.set(String(organizationId), locations);
  }

  async findAllForOrganization(organizationId: OrganizationId): Promise<Location[]> {
    return this.byOrganization.get(String(organizationId)) ?? [];
  }

  async findOneForOrganization(organizationId: OrganizationId, locationId: string): Promise<Location | null> {
    const locations = this.byOrganization.get(String(organizationId)) ?? [];
    return locations.find((l) => l.id === locationId) ?? null;
  }
}
