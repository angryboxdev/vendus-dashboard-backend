import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  BankMovementLinkReadPort,
  LinkedBankMovement,
} from "../../domain/ports/out/bank-movement-link-read.port.js";

function key(organizationId: OrganizationId, occurrenceId: string): string {
  return `${organizationId}:${occurrenceId}`;
}

export class FakeBankMovementLinkReadAdapter implements BankMovementLinkReadPort {
  private links = new Map<string, LinkedBankMovement>();

  /** Seeds a bank movement link for a given occurrenceId. */
  seedLink(organizationId: OrganizationId, occurrenceId: string, link: LinkedBankMovement): void {
    this.links.set(key(organizationId, occurrenceId), link);
  }

  async findByOccurrenceIds(
    organizationId: OrganizationId,
    occurrenceIds: string[],
  ): Promise<Map<string, LinkedBankMovement>> {
    const result = new Map<string, LinkedBankMovement>();
    for (const id of occurrenceIds) {
      const link = this.links.get(key(organizationId, id));
      if (link) result.set(id, link);
    }
    return result;
  }
}
