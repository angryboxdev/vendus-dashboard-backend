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
      currency: (row.currency as string | null) ?? "EUR",
      documentType: (row.document_type as "invoice" | "credit_note" | null) ?? "invoice",
    };
  }

  async findByIds(organizationId: OrganizationId, ids: string[]): Promise<InvoiceMatchCandidate[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.scopedQuery(organizationId)
      .table("invoices")
      .select("id, supplier_id, supplier_name, invoice_number, total_with_vat, invoice_date, due_date, paid_at, status, currency, document_type")
      .in("id", ids);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.mapRow(row as unknown as Record<string, unknown>));
  }

  async findBySupplier(
    organizationId: OrganizationId,
    opts: { supplierId: string; currency: string; maxDate: string }
  ): Promise<InvoiceMatchCandidate[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("invoices")
      .select("id, supplier_id, supplier_name, invoice_number, total_with_vat, invoice_date, due_date, paid_at, status, currency, document_type")
      .eq("supplier_id", opts.supplierId)
      .eq("currency", opts.currency)
      .in("document_type", ["invoice", "credit_note"])
      .neq("reconciliation_status", "reconciled")
      .lte("invoice_date", opts.maxDate)
      .order("invoice_date", { ascending: false })
      .limit(200);

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
      .select("id, supplier_id, supplier_name, invoice_number, total_with_vat, invoice_date, due_date, paid_at, status, currency, document_type")
      // Notas de crédito nunca são sugeridas neste caminho de candidato único
      // — o caminho de liquidação agrupada (`findBySupplier`) é que as inclui
      // deliberadamente. Mantido tal como estava (ver README): o total
      // negativo já cairia fora da janela [min,max] para um amountCents
      // positivo, mas o filtro explícito deixa a regra clara e não depende
      // disso.
      .eq("document_type", "invoice")
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
