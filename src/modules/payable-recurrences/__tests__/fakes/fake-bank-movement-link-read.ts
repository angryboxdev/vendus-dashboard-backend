import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  BankMovementLinkReadPort,
  LinkedBankMovement,
} from "../../domain/ports/out/bank-movement-link-read.port.js";

function key(organizationId: OrganizationId, occurrenceId: string): string {
  return `${organizationId}:${occurrenceId}`;
}

export class FakeBankMovementLinkReadAdapter implements BankMovementLinkReadPort {
  private links = new Map<string, LinkedBankMovement[]>();

  /** Seeds a bank movement link for a given occurrenceId. Call more than once for the same occurrenceId to simulate a partial payment (multiple linked movements). */
  seedLink(organizationId: OrganizationId, occurrenceId: string, link: LinkedBankMovement): void {
    const k = key(organizationId, occurrenceId);
    this.links.set(k, [...(this.links.get(k) ?? []), link]);
  }

  async findByOccurrenceIds(
    organizationId: OrganizationId,
    occurrenceIds: string[],
  ): Promise<Map<string, LinkedBankMovement[]>> {
    const result = new Map<string, LinkedBankMovement[]>();
    for (const id of occurrenceIds) {
      const link = this.links.get(key(organizationId, id));
      if (link) result.set(id, link);
    }
    return result;
  }
}
