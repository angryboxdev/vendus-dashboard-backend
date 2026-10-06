import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Location } from "../../domain/entities/location.js";
import { DuplicateLocationCodeError, LocationNotFoundError } from "../../domain/errors.js";
import type { LocationDto } from "../../domain/ports/in/list-locations.port.js";
import type { LocationRepositoryPort } from "../../domain/ports/out/location-repository.port.js";

export function toLocationDto(l: Location): LocationDto {
  return {
    id: l.id,
    name: l.name,
    code: l.code,
    timezone: l.timezone,
    isActive: l.isActive,
    address: l.address,
    postalCode: l.postalCode,
    city: l.city,
    municipality: l.municipality,
    country: l.country,
    phone: l.phone,
    geofence: l.geofence,
  };
}

export async function loadLocationOrThrow(
  repository: LocationRepositoryPort,
  organizationId: OrganizationId,
  locationId: string,
): Promise<Location> {
  const location = await repository.findOneForOrganization(organizationId, locationId);
  if (!location) throw new LocationNotFoundError(locationId);
  return location;
}

/**
 * Verificação antecipada para devolver um erro claro antes de gravar — a
 * restrição `unique (org_id, code)` na BD continua a ser a garantia final
 * (o adapter traduz a violação para o mesmo erro).
 */
export async function assertCodeAvailable(
  repository: LocationRepositoryPort,
  organizationId: OrganizationId,
  location: Location,
): Promise<void> {
  if (location.code === null) return;
  const all = await repository.findAllForOrganization(organizationId);
  if (all.some((l) => l.id !== location.id && l.code === location.code)) {
    throw new DuplicateLocationCodeError(location.code);
  }
}
