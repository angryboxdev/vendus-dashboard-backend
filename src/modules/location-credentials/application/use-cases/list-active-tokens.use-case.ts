import type { LocationTokenRepositoryPort } from "../../domain/ports/out/location-token-repository.port.js";
import type {
  ListActiveTokensCommand,
  ListActiveTokensPort,
  LocationTokenDto,
} from "../../domain/ports/in/list-active-tokens.port.js";

export class ListActiveTokensUseCase implements ListActiveTokensPort {
  constructor(private readonly locationTokenRepository: LocationTokenRepositoryPort) {}

  async execute(command: ListActiveTokensCommand): Promise<LocationTokenDto[]> {
    const tokens = await this.locationTokenRepository.listByLocation(
      command.organizationId,
      command.locationId,
    );
    return tokens.map((t) => ({ id: t.id, issuedAt: t.issuedAt }));
  }
}
