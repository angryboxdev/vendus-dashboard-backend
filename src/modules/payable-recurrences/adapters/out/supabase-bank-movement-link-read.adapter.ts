import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BankMovementLinkReadPort,
  LinkedBankMovement,
} from "../../domain/ports/out/bank-movement-link-read.port.js";

interface BankMovementRow {
  id: string;
  matched_entity_id: string;
  booking_date: string;
  amount: number;
  description: string;
}

export class SupabaseBankMovementLinkReadAdapter implements BankMovementLinkReadPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async findByOccurrenceIds(occurrenceIds: string[]): Promise<Map<string, LinkedBankMovement>> {
    if (occurrenceIds.length === 0) return new Map();

    const { data, error } = await this.supabase
      .from("bank_movements")
      .select("id, matched_entity_id, booking_date, amount, description")
      .eq("matched_entity_type", "recurrence_occurrence")
      .in("matched_entity_id", occurrenceIds);

    if (error) throw new Error(error.message);

    const result = new Map<string, LinkedBankMovement>();
    for (const row of (data ?? []) as BankMovementRow[]) {
      result.set(row.matched_entity_id, {
        id: row.id,
        bookingDate: row.booking_date.slice(0, 10),
        amountCents: row.amount,
        description: row.description,
      });
    }
    return result;
  }
}
