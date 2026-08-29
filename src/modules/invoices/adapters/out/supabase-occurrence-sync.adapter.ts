import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OccurrenceSyncPort } from "../../domain/ports/out/occurrence-sync.port.js";

/**
 * Adapter cross-módulo — actualiza recurring_occurrences directamente,
 * sem importar código do módulo payable-recurrences.
 *
 * Nunca guarda um `SupabaseClient` — recebe o factory `createScopedQuery`
 * (`ScopedQueryFactory`) injectado pelo composition root e constrói um
 * `ScopedQuery` por chamada (D2).
 */
export class SupabaseOccurrenceSyncAdapter implements OccurrenceSyncPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async markPaidByInvoiceId(organizationId: OrganizationId, invoiceId: string, paidAt: Date): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("recurring_occurrences")
      .update({ status: "paid", paid_at: paidAt.toISOString() })
      .eq("invoice_id", invoiceId)
      .not("status", "in", '("paid","reconciled","cancelled")');

    if (error) throw new Error(error.message);
  }
}
