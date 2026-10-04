import type { LocationRepositoryPort } from "../../domain/ports/out/location-repository.port.js";
import type {
  ListLocationsInput,
  ListLocationsPort,
  LocationDto,
} from "../../domain/ports/in/list-locations.port.js";
import { toLocationDto } from "./shared.js";

export class ListLocationsUseCase implements ListLocationsPort {
  constructor(private readonly locationRepository: LocationRepositoryPort) {}

  async execute(input: ListLocationsInput): Promise<LocationDto[]> {
    const locations = await this.locationRepository.findAllForOrganization(input.organizationId);
    return locations.map(toLocationDto);
  }
}
