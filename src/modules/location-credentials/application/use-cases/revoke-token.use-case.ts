import type { LocationTokenRepositoryPort } from "../../domain/ports/out/location-token-repository.port.js";
import type { RevokeTokenCommand, RevokeTokenPort } from "../../domain/ports/in/revoke-token.port.js";

export class RevokeTokenUseCase implements RevokeTokenPort {
  constructor(private readonly locationTokenRepository: LocationTokenRepositoryPort) {}

  async execute(command: RevokeTokenCommand): Promise<void> {
    await this.locationTokenRepository.deleteById(command.organizationId, command.tokenId);
  }
}
