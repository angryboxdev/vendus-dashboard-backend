import { createHash, randomBytes } from "node:crypto";
import { LocationToken } from "../../domain/entities/location-token.js";
import {
  PairingCodeAlreadyUsedError,
  PairingCodeExpiredError,
  PairingCodeNotFoundError,
} from "../../domain/errors.js";
import type { PairingCodeRepositoryPort } from "../../domain/ports/out/pairing-code-repository.port.js";
import type { LocationTokenRepositoryPort } from "../../domain/ports/out/location-token-repository.port.js";
import type {
  RedeemPairingCodeCommand,
  RedeemPairingCodePort,
  RedeemPairingCodeResult,
} from "../../domain/ports/in/redeem-pairing-code.port.js";

const TOKEN_BYTES = 32;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export class RedeemPairingCodeUseCase implements RedeemPairingCodePort {
  constructor(
    private readonly pairingCodeRepository: PairingCodeRepositoryPort,
    private readonly locationTokenRepository: LocationTokenRepositoryPort,
  ) {}

  async execute(command: RedeemPairingCodeCommand): Promise<RedeemPairingCodeResult> {
    const pairingCode = await this.pairingCodeRepository.findByCode(command.code);
    if (!pairingCode) {
      throw new PairingCodeNotFoundError();
    }
    if (pairingCode.isBurned) {
      throw new PairingCodeAlreadyUsedError();
    }

    // Burned on this attempt regardless of what happens next — D6/stories
    // 2-3: a code that expired between generation and this call, or a
    // screen that never receives the response below, must not be usable
    // again.
    pairingCode.burn(new Date());
    await this.pairingCodeRepository.save(pairingCode);

    if (pairingCode.isExpired(new Date())) {
      throw new PairingCodeExpiredError();
    }

    const rawToken = randomBytes(TOKEN_BYTES).toString("hex");
    const locationToken = LocationToken.create({
      organizationId: pairingCode.organizationId,
      locationId: pairingCode.locationId,
      tokenHash: hashToken(rawToken),
      description: pairingCode.description,
    });
    await this.locationTokenRepository.save(locationToken);

    return { token: rawToken };
  }
}
