import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Location } from "../../domain/entities/location.js";
import { DuplicateLocationCodeError } from "../../domain/errors.js";
import type { LocationRepositoryPort } from "../../domain/ports/out/location-repository.port.js";

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

  /** Reproduz a restrição `unique (org_id, code)` da BD. */
  private assertUniqueCode(organizationId: OrganizationId, location: Location): void {
    const clash = (this.byOrganization.get(organizationId) ?? []).some(
      (l) => l.id !== location.id && location.code !== null && l.code === location.code,
    );
    if (clash) throw new DuplicateLocationCodeError(location.code!);
  }

  async insert(organizationId: OrganizationId, location: Location): Promise<void> {
    this.assertUniqueCode(organizationId, location);
    this.byOrganization.set(organizationId, [...(this.byOrganization.get(organizationId) ?? []), location]);
  }

  async update(organizationId: OrganizationId, location: Location): Promise<void> {
    this.assertUniqueCode(organizationId, location);
    this.byOrganization.set(
      organizationId,
      (this.byOrganization.get(organizationId) ?? []).map((l) => (l.id === location.id ? location : l)),
    );
  }
}
