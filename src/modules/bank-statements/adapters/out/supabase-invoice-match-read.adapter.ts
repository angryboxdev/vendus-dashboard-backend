import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InvoiceMatchCandidate,
  InvoiceMatchReadPort,
} from "../../domain/ports/out/invoice-match-read.port.js";

/**
 * Cross-module adapter: reads from the `invoices` table without importing
 * any code from the invoices module.
 */
export class SupabaseInvoiceMatchReadAdapter implements InvoiceMatchReadPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async findCandidates(opts: {
    amountCents: number;
    dateFrom: string;
    dateTo: string;
    toleranceCents?: number;
  }): Promise<InvoiceMatchCandidate[]> {
    const tolerance = opts.toleranceCents ?? 0;
    const min = opts.amountCents - tolerance;
    const max = opts.amountCents + tolerance;

    const { data, error } = await this.supabase
      .from("invoices")
      .select("id, supplier_id, supplier_name, invoice_number, total_with_vat, invoice_date, due_date, paid_at, status")
      .in("status", ["pending", "overdue"])
      .gte("total_with_vat", min)
      .lte("total_with_vat", max)
      .or(
        `and(paid_at.gte.${opts.dateFrom},paid_at.lte.${opts.dateTo}),and(due_date.gte.${opts.dateFrom},due_date.lte.${opts.dateTo}),and(invoice_date.gte.${opts.dateFrom},invoice_date.lte.${opts.dateTo})`
      );

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        supplierId: (r.supplier_id as string | null) ?? null,
        supplierName: r.supplier_name as string,
        invoiceNumber: r.invoice_number as string,
        totalWithVat: r.total_with_vat as number,
        invoiceDate: r.invoice_date as string,
        dueDate: (r.due_date as string | null) ?? null,
        paidAt: (r.paid_at as string | null) ?? null,
        status: r.status as string,
      };
    });
  }
}
