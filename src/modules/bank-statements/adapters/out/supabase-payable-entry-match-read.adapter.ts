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
      .select("id, supplier_id, supplier_name, description, amount, due_date, status")
      .in("status", ["pending", "overdue"])
      .gte("amount", min)
      .lte("amount", max)
      .gte("due_date", opts.dateFrom)
      .lte("due_date", opts.dateTo);

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        supplierId: (r.supplier_id as string | null) ?? null,
        supplierName: r.supplier_name as string,
        description: r.description as string,
        amount: r.amount as number,
        dueDate: r.due_date as string,
        status: r.status as string,
      };
    });
  }
}
