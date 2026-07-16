import type { MovementMatchHintPort } from "../../domain/ports/out/movement-match-hint.port.js";

export class FakeMovementMatchHint implements MovementMatchHintPort {
  /** Map: normalizedDesc → supplierId */
  private hints = new Map<string, string>();
  /** Recorded saves for assertion in tests */
  readonly savedCalls: Array<{ normalizedDesc: string; supplierId: string }> = [];

  /** Pre-populate a hint for test setup */
  setHint(normalizedDesc: string, supplierId: string): void {
    this.hints.set(normalizedDesc, supplierId);
  }

  async findSupplierByDescription(normalizedDesc: string): Promise<string | null> {
    return this.hints.get(normalizedDesc) ?? null;
  }

  async save(normalizedDesc: string, supplierId: string): Promise<void> {
    this.hints.set(normalizedDesc, supplierId);
    this.savedCalls.push({ normalizedDesc, supplierId });
  }
}
