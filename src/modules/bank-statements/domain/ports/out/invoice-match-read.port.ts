import type { OrganizationId } from "../../../../../kernel/organization-id.js";

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
  totalWithVat: number; // cents — signed: negative for credit notes (Invoice.normalizeAmountSign)
  invoiceDate: string; // YYYY-MM-DD
  dueDate: string | null; // YYYY-MM-DD
  paidAt: string | null; // YYYY-MM-DD
  status: string;
  currency: string;
  documentType: "invoice" | "credit_note";
}

export interface InvoiceMatchReadPort {
  /**
   * Returns invoices with totalWithVat within toleranceCents of amountCents,
   * whose invoiceDate or dueDate falls within the dateFrom–dateTo window,
   * and whose status is pending/unpaid.
   *
   * Only `document_type = 'invoice'` — credit notes are never suggested on
   * this single-candidate path (kept exactly as before; grouped-settlement
   * candidates go through `findBySupplier` instead, see its doc comment).
   */
  findCandidates(
    organizationId: OrganizationId,
    opts: {
      amountCents: number;
      dateFrom: string; // YYYY-MM-DD
      dateTo: string; // YYYY-MM-DD
      toleranceCents?: number;
    }
  ): Promise<InvoiceMatchCandidate[]>;

  /** Returns invoices by their IDs regardless of status or date — used when reconciling. */
  findByIds(organizationId: OrganizationId, ids: string[]): Promise<InvoiceMatchCandidate[]>;

  /**
   * Grouped-settlement candidate pool: ALL non-reconciled documents (both
   * `invoice` AND `credit_note`) for one supplier, in one currency, dated on
   * or before `maxDate` (the movement's booking date — task section 8: a
   * document dated after the movement can only be added via manual
   * selection, never surfaced by the automatic matcher). Not amount-filtered
   * — the caller runs combinatorics over the pool, so amount can't narrow the
   * query. Ordered by invoiceDate desc (nearest-first) and capped generously
   * at the adapter level; the use case re-caps to the matcher's own limit
   * (~40) by exact date-proximity to the movement date.
   */
  findBySupplier(
    organizationId: OrganizationId,
    opts: {
      supplierId: string;
      currency: string;
      maxDate: string; // YYYY-MM-DD
    }
  ): Promise<InvoiceMatchCandidate[]>;
}
