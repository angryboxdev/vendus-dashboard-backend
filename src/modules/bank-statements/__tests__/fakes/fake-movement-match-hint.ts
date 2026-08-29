import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { MovementMatchHintPort } from "../../domain/ports/out/movement-match-hint.port.js";

function key(organizationId: OrganizationId, normalizedDesc: string): string {
  return `${organizationId}:${normalizedDesc}`;
}

export class FakeMovementMatchHint implements MovementMatchHintPort {
  /** Map: "organizationId:normalizedDesc" → supplierId */
  private hints = new Map<string, string>();
  /** Recorded saves for assertion in tests */
  readonly savedCalls: Array<{ normalizedDesc: string; supplierId: string }> = [];

  /** Pre-populate a hint for test setup */
  setHint(organizationId: OrganizationId, normalizedDesc: string, supplierId: string): void {
    this.hints.set(key(organizationId, normalizedDesc), supplierId);
  }

  async findSupplierByDescription(
    organizationId: OrganizationId,
    normalizedDesc: string
  ): Promise<string | null> {
    return this.hints.get(key(organizationId, normalizedDesc)) ?? null;
  }

  async save(
    organizationId: OrganizationId,
    normalizedDesc: string,
    supplierId: string
  ): Promise<void> {
    this.hints.set(key(organizationId, normalizedDesc), supplierId);
    this.savedCalls.push({ normalizedDesc, supplierId });
  }
}
