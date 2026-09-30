import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { LocationReadPort, LocationSnapshot } from "../../domain/ports/out/location-read.port.js";

export class FakeLocationRead implements LocationReadPort {
  locations: LocationSnapshot[] = [];

  async listActive(_organizationId: OrganizationId): Promise<LocationSnapshot[]> {
    return this.locations.filter((l) => l.isActive);
  }
}
