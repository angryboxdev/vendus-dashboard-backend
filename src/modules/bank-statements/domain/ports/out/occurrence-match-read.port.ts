import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Output port — cross-module read access to recurrence occurrences for matching purposes.
 * The adapter accesses recurring_occurrences + payable_recurrences tables directly via Supabase
 * without importing any code from the payable-recurrences module.
 *
 * Only occurrences WITHOUT an invoice (invoice_id IS NULL) are exposed here,
 * since those with an invoice should be reconciled through the invoice instead.
 */
export interface OccurrenceMatchCandidate {
  id: string;
  recurrenceId: string;
  recurrenceName: string;
  supplierId: string | null;
  supplierName: string;
  period: string;          // YYYY-MM
  estimatedAmountCents: number;
  realAmountCents: number | null;
  effectiveAmountCents: number; // realAmountCents ?? estimatedAmountCents
  dueDate: string;         // YYYY-MM-DD
  status: string;          // forecast | awaiting_invoice | paid | cancelled
  /** Classificação da recorrência-mãe — usada para auto-preencher o drawer "Justificar despesa → Contrato/Recorrência" (só campos ainda vazios, nunca sobrescreve edição manual). */
  costCenterGroupId: string | null;
  costCenterCategoryId: string | null;
  vatRate: number | null;
  vatIncluded: boolean | null;
}

export interface OccurrenceMatchReadPort {
  /**
   * Full-text search: filters by supplier name / recurrence name substring (q),
   * optionally limited to a date window around dueDate.
   * Excludes cancelled occurrences and those already linked to an invoice.
   */
  search(
    organizationId: OrganizationId,
    opts: {
      q?: string;
      dateFrom?: string; // YYYY-MM-DD
      dateTo?: string;   // YYYY-MM-DD
      /** Quando presente, ordena os resultados pela proximidade a esta data (sempre — nunca restringe/exclui). Normalmente a bookingDate do movimento bancário. */
      referenceDate?: string; // YYYY-MM-DD
      limit?: number;
    }
  ): Promise<OccurrenceMatchCandidate[]>;

  /** Returns occurrences by their IDs regardless of status — used when displaying saved links. */
  findByIds(organizationId: OrganizationId, ids: string[]): Promise<OccurrenceMatchCandidate[]>;
}
