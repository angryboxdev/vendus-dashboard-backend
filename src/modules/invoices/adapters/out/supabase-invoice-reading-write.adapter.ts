import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { InvoiceReadingWritePort } from "../../domain/ports/out/invoice-reading-write.port.js";

/** Colunas `invoices.fiscal_qr` / `reading_source` (migração 20261106100000). */
export class SupabaseInvoiceReadingWriteAdapter implements InvoiceReadingWritePort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async save(organizationId: OrganizationId, invoiceId: string, data: { fiscalQr: Record<string, string> | null; source: "deterministic" | "ai" }): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("invoices")
      .update({ fiscal_qr: data.fiscalQr, reading_source: data.source })
      .eq("id", invoiceId);
    if (error) throw new Error(error.message);
  }
}
