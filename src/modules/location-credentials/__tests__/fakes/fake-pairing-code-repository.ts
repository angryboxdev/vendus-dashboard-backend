import type { PairingCode } from "../../domain/entities/pairing-code.js";
import type { PairingCodeRepositoryPort } from "../../domain/ports/out/pairing-code-repository.port.js";

export class FakePairingCodeRepository implements PairingCodeRepositoryPort {
  private readonly byId = new Map<string, PairingCode>();

  async save(pairingCode: PairingCode): Promise<void> {
    this.byId.set(pairingCode.id, pairingCode);
  }

  async findByCode(code: string): Promise<PairingCode | null> {
    for (const pairingCode of this.byId.values()) {
      if (pairingCode.code === code) return pairingCode;
    }
    return null;
  }
}
