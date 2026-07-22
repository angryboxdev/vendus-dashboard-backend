import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PayableEntryMatchCandidate,
  PayableEntryMatchReadPort,
} from "../../domain/ports/out/payable-entry-match-read.port.js";

/**
 * Cross-module adapter: reads from the `payable_entries` table without importing
 * any code from the payable-entries module.
 */
export class SupabasePayableEntryMatchReadAdapter implements PayableEntryMatchReadPort {
  constructor(private readonly supabase: SupabaseClient) {}

  private mapRow(row: Record<string, unknown>): PayableEntryMatchCandidate {
    return {
      id: row.id as string,
      supplierId: (row.supplier_id as string | null) ?? null,
      supplierName: row.supplier_name as string,
      description: row.description as string,
      amount: row.amount as number,
      dueDate: row.due_date as string,
      status: row.status as string,
      invoiceId: (row.invoice_id as string | null) ?? null,
    };
  }

  async findByIds(ids: string[]): Promise<PayableEntryMatchCandidate[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.supabase
      .from("payable_entries")
      .select("id, supplier_id, supplier_name, description, amount, due_date, status, invoice_id")
      .in("id", ids);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.mapRow(row as Record<string, unknown>));
  }

  async findCandidates(opts: {
    amountCents: number;
    dateFrom: string;
    dateTo: string;
    toleranceCents?: number;
  }): Promise<PayableEntryMatchCandidate[]> {
    const tolerance = opts.toleranceCents ?? 0;
    const min = opts.amountCents - tolerance;
    const max = opts.amountCents + tolerance;

    const { data, error } = await this.supabase
      .from("payable_entries")
      .select("id, supplier_id, supplier_name, description, amount, due_date, status, invoice_id")
      .gte("amount", min)
      .lte("amount", max)
      .gte("due_date", opts.dateFrom)
      .lte("due_date", opts.dateTo);

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => this.mapRow(row as Record<string, unknown>));
  }
}
