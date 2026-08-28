import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Output port — cross-module read access to bank_movements to check if any bank movement
 * has been justified against a recurrence occurrence.
 *
 * The adapter reads bank_movements directly via Supabase without importing any code
 * from the bank-statements module.
 */
export interface LinkedBankMovement {
  id: string;
  bookingDate: string; // YYYY-MM-DD
  amountCents: number;
  description: string;
}

export interface BankMovementLinkReadPort {
  /**
   * Returns a map of occurrenceId → LinkedBankMovement for the given occurrence IDs.
   * Occurrences with no linked movement are absent from the map.
   */
  findByOccurrenceIds(
    organizationId: OrganizationId,
    occurrenceIds: string[],
  ): Promise<Map<string, LinkedBankMovement>>;
}
