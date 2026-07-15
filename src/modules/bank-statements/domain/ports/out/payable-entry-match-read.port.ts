/**
 * Output port — cross-module read access to payable entries for matching purposes.
 * The adapter accesses the payable_entries table directly via Supabase
 * without importing any code from the payable-entries module.
 */
export interface PayableEntryMatchCandidate {
  id: string;
  supplierId: string | null;
  supplierName: string;
  description: string;
  amount: number; // cents
  dueDate: string; // YYYY-MM-DD
  status: string;
}

export interface PayableEntryMatchReadPort {
  /**
   * Returns payable entries with amount within toleranceCents of amountCents,
   * whose dueDate falls between dateFrom and dateTo, and whose status is pending/overdue.
   */
  findCandidates(opts: {
    amountCents: number;
    dateFrom: string; // YYYY-MM-DD
    dateTo: string; // YYYY-MM-DD
    toleranceCents?: number;
  }): Promise<PayableEntryMatchCandidate[]>;
}
