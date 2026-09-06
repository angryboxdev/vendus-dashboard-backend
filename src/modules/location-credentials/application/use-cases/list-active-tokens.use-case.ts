import type { LocationTokenRepositoryPort } from "../../domain/ports/out/location-token-repository.port.js";
import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";
import { LocationNotOwnedError } from "../../domain/errors.js";
import type {
  ListActiveTokensCommand,
  ListActiveTokensPort,
  LocationTokenDto,
} from "../../domain/ports/in/list-active-tokens.port.js";

export class ListActiveTokensUseCase implements ListActiveTokensPort {
  constructor(
    private readonly locationTokenRepository: LocationTokenRepositoryPort,
    private readonly locationRepository: LocationRepositoryPort,
  ) {}

  async execute(command: ListActiveTokensCommand): Promise<LocationTokenDto[]> {
    const location = await this.locationRepository.findOneForOrganization(
      command.organizationId,
      command.locationId,
    );
    if (!location) {
      throw new LocationNotOwnedError(command.locationId);
    }

    const tokens = await this.locationTokenRepository.listByLocation(
      command.organizationId,
      command.locationId,
    );
    return tokens.map((t) => ({
      id: t.id,
      issuedAt: t.issuedAt,
      locationName: location.name,
      description: t.description,
    }));
  }
}
