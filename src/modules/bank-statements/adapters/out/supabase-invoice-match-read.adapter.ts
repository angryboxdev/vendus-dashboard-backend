import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type {
  InvoiceMatchCandidate,
  InvoiceMatchReadPort,
} from "../../domain/ports/out/invoice-match-read.port.js";

/**
 * Cross-module adapter: reads from the `invoices` table without importing
 * any code from the invoices module.
 */
export class SupabaseInvoiceMatchReadAdapter implements InvoiceMatchReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  private mapRow(row: Record<string, unknown>): InvoiceMatchCandidate {
    return {
      id: row.id as string,
      supplierId: (row.supplier_id as string | null) ?? null,
      supplierName: row.supplier_name as string,
      invoiceNumber: row.invoice_number as string,
      totalWithVat: row.total_with_vat as number,
      invoiceDate: row.invoice_date as string,
      dueDate: (row.due_date as string | null) ?? null,
      paidAt: (row.paid_at as string | null) ?? null,
      status: row.status as string,
    };
  }

  async findByIds(organizationId: OrganizationId, ids: string[]): Promise<InvoiceMatchCandidate[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.scopedQuery(organizationId)
      .table("invoices")
      .select("id, supplier_id, supplier_name, invoice_number, total_with_vat, invoice_date, due_date, paid_at, status")
      .in("id", ids);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.mapRow(row as unknown as Record<string, unknown>));
  }

  async findCandidates(
    organizationId: OrganizationId,
    opts: {
      amountCents: number;
      dateFrom: string;
      dateTo: string;
      toleranceCents?: number;
    }
  ): Promise<InvoiceMatchCandidate[]> {
    const tolerance = opts.toleranceCents ?? 0;
    const min = opts.amountCents - tolerance;
    const max = opts.amountCents + tolerance;

    const { data, error } = await this.scopedQuery(organizationId)
      .table("invoices")
      .select("id, supplier_id, supplier_name, invoice_number, total_with_vat, invoice_date, due_date, paid_at, status")
      .gte("total_with_vat", min)
      .lte("total_with_vat", max)
      .neq("reconciliation_status", "reconciled")
      .or(
        `and(paid_at.gte.${opts.dateFrom},paid_at.lte.${opts.dateTo}),and(due_date.gte.${opts.dateFrom},due_date.lte.${opts.dateTo}),and(invoice_date.gte.${opts.dateFrom},invoice_date.lte.${opts.dateTo})`
      );

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => this.mapRow(row as unknown as Record<string, unknown>));
  }
}
