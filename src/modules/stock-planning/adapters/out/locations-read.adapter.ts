import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ListLocationsPort } from "../../../locations/domain/ports/in/list-locations.port.js";
import type { LocationReadPort, LocationSnapshot } from "../../domain/ports/out/location-read.port.js";

/** D10 — porta de `locations` injetada diretamente, sem tradução (mesmo padrão de `stock-purchase-review`/`stock-count`). */
export class LocationsReadAdapter implements LocationReadPort {
  constructor(private readonly listLocations: ListLocationsPort) {}

  async listActive(organizationId: OrganizationId): Promise<LocationSnapshot[]> {
    const locations = await this.listLocations.execute({ organizationId });
    return locations.filter((l) => l.isActive).map((l) => ({ id: l.id, name: l.name, isActive: l.isActive }));
  }
}
