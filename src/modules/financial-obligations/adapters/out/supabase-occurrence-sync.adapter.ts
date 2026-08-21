import type { SupabaseClient } from "@supabase/supabase-js";
import type { OccurrenceSyncPort } from "../../domain/ports/out/occurrence-sync.port.js";

/**
 * Cross-module adapter — acede directamente à tabela recurring_occurrences
 * sem importar código do módulo payable-recurrences.
 *
 * Quando uma obrigação financeira de origem 'recurrence' é marcada como paga,
 * transita o estado da ocorrência vinculada de payable_created → paid.
 */
export class SupabaseOccurrenceSyncAdapter implements OccurrenceSyncPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async syncPayableMarkedPaid(payableEntryId: string): Promise<void> {
    const { error } = await this.supabase
      .from("recurring_occurrences")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("payable_entry_id", payableEntryId)
      .eq("status", "payable_created");

    if (error) throw new Error(`Occurrence sync failed: ${error.message}`);
  }
}
