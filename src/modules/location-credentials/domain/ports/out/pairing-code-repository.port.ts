import type { PairingCode } from "../../entities/pairing-code.js";

export interface PairingCodeRepositoryPort {
  save(pairingCode: PairingCode): Promise<void>;
  /**
   * Looked up by value alone — at redemption time no organization is known
   * yet, that's the whole point of pairing (spec E D5/D6).
   */
  findByCode(code: string): Promise<PairingCode | null>;
}
