import type { SupabaseClient } from "@supabase/supabase-js";
import type { OccurrenceSyncPort } from "../../domain/ports/out/occurrence-sync.port.js";

/**
 * Adapter cross-módulo — actualiza recurring_occurrences directamente,
 * sem importar código do módulo payable-recurrences.
 */
export class SupabaseOccurrenceSyncAdapter implements OccurrenceSyncPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async markPaidByInvoiceId(invoiceId: string, paidAt: Date): Promise<void> {
    const { error } = await this.supabase
      .from("recurring_occurrences")
      .update({ status: "paid", paid_at: paidAt.toISOString() })
      .eq("invoice_id", invoiceId)
      .not("status", "in", '("paid","reconciled","cancelled")');

    if (error) throw new Error(error.message);
  }
}
