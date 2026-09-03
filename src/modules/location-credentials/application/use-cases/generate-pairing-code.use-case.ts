import { randomBytes } from "node:crypto";
import { PairingCode } from "../../domain/entities/pairing-code.js";
import { LocationNotOwnedError } from "../../domain/errors.js";
import type { PairingCodeRepositoryPort } from "../../domain/ports/out/pairing-code-repository.port.js";
import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";
import type {
  GeneratePairingCodeCommand,
  GeneratePairingCodePort,
  GeneratePairingCodeResult,
} from "../../domain/ports/in/generate-pairing-code.port.js";

/** Minutes until a generated code expires (D6: "expires within minutes"). */
const PAIRING_CODE_TTL_MINUTES = 10;
const PAIRING_CODE_LENGTH = 8;
// No 0/O/1/I/L — a human reads and types this on an unpaired screen (D6).
const PAIRING_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateHumanPairingCode(): string {
  const bytes = randomBytes(PAIRING_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
    code += PAIRING_CODE_ALPHABET[bytes[i]! % PAIRING_CODE_ALPHABET.length];
  }
  return code;
}

export class GeneratePairingCodeUseCase implements GeneratePairingCodePort {
  constructor(
    private readonly pairingCodeRepository: PairingCodeRepositoryPort,
    private readonly locationRepository: LocationRepositoryPort,
  ) {}

  async execute(command: GeneratePairingCodeCommand): Promise<GeneratePairingCodeResult> {
    const location = await this.locationRepository.findOneForOrganization(
      command.organizationId,
      command.locationId,
    );
    if (!location) {
      throw new LocationNotOwnedError(command.locationId);
    }

    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MINUTES * 60_000);
    const pairingCode = PairingCode.create({
      organizationId: command.organizationId,
      locationId: command.locationId,
      code: generateHumanPairingCode(),
      expiresAt,
    });
    await this.pairingCodeRepository.save(pairingCode);

    return { code: pairingCode.code, expiresAt: pairingCode.expiresAt };
  }
}
