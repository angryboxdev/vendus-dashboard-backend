import type { SupabaseClient } from "@supabase/supabase-js";
import type { BankAccountReadPort } from "../../domain/ports/out/bank-account-read.port.js";

/**
 * Cross-module adapter: queries bank_accounts table directly.
 * Only exposes the minimal surface needed by bank-statements (id lookup).
 */
export class SupabaseBankAccountReadAdapter implements BankAccountReadPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async findByAccountNumber(raw: string): Promise<{ id: string } | null> {
    const normalised = raw.trim().replace(/\s+/g, "").toUpperCase();
    const { data, error } = await this.supabase
      .from("bank_accounts")
      .select("id, iban, account_number")
      .or(`iban.ilike.${normalised},account_number.ilike.${normalised}`)
      .eq("is_active", true)
      .limit(5);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return null;

    // Domain-level match to handle whitespace in stored values
    for (const row of data as Record<string, unknown>[]) {
      const iban = ((row["iban"] as string | null) ?? "").replace(/\s+/g, "").toUpperCase();
      const accNum = ((row["account_number"] as string | null) ?? "").replace(/\s+/g, "").toUpperCase();
      if (iban === normalised || accNum === normalised) {
        return { id: row["id"] as string };
      }
    }
    return null;
  }

  async findById(id: string): Promise<{ id: string } | null> {
    const { data, error } = await this.supabase
      .from("bank_accounts")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return { id: (data as Record<string, unknown>)["id"] as string };
  }
}
