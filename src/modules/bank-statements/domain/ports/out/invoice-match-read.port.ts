/**
 * Output port — cross-module read access to invoices for matching purposes.
 * The adapter accesses the invoices table directly via Supabase
 * without importing any code from the invoices module.
 */
export interface InvoiceMatchCandidate {
  id: string;
  supplierId: string | null;
  supplierName: string;
  invoiceNumber: string;
  totalWithVat: number; // cents
  invoiceDate: string; // YYYY-MM-DD
  dueDate: string | null; // YYYY-MM-DD
  paidAt: string | null; // YYYY-MM-DD
  status: string;
}

export interface InvoiceMatchReadPort {
  /**
   * Returns invoices with totalWithVat within toleranceCents of amountCents,
   * whose invoiceDate or dueDate falls within the dateFrom–dateTo window,
   * and whose status is pending/unpaid.
   */
  findCandidates(opts: {
    amountCents: number;
    dateFrom: string; // YYYY-MM-DD
    dateTo: string; // YYYY-MM-DD
    toleranceCents?: number;
  }): Promise<InvoiceMatchCandidate[]>;
}
