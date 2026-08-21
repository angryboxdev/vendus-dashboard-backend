import type {
  BankMovementLinkReadPort,
  LinkedBankMovement,
} from "../../domain/ports/out/bank-movement-link-read.port.js";

export class FakeBankMovementLinkReadAdapter implements BankMovementLinkReadPort {
  private links = new Map<string, LinkedBankMovement>();

  /** Seeds a bank movement link for a given occurrenceId. */
  seedLink(occurrenceId: string, link: LinkedBankMovement): void {
    this.links.set(occurrenceId, link);
  }

  async findByOccurrenceIds(occurrenceIds: string[]): Promise<Map<string, LinkedBankMovement>> {
    const result = new Map<string, LinkedBankMovement>();
    for (const id of occurrenceIds) {
      const link = this.links.get(id);
      if (link) result.set(id, link);
    }
    return result;
  }
}
