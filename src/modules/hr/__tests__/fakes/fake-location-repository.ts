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

  /** O `hr` só lê locais — escrita existe no port desde a gestão de Locais (módulo `locations`), aqui basta guardar. */
  async insert(organizationId: OrganizationId, location: Location): Promise<void> {
    this.byOrganization.set(String(organizationId), [...(this.byOrganization.get(String(organizationId)) ?? []), location]);
  }

  async update(organizationId: OrganizationId, location: Location): Promise<void> {
    const locations = this.byOrganization.get(String(organizationId)) ?? [];
    this.byOrganization.set(String(organizationId), locations.map((l) => (l.id === location.id ? location : l)));
  }
}
