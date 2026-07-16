import type { SupabaseClient } from "@supabase/supabase-js";
import type { MovementMatchHintPort } from "../../domain/ports/out/movement-match-hint.port.js";

export class SupabaseMovementMatchHintAdapter implements MovementMatchHintPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async findSupplierByDescription(normalizedDesc: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("bank_movement_match_hints")
      .select("supplier_id")
      .eq("normalized_description", normalizedDesc)
      .order("use_count", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return (data as Record<string, unknown>).supplier_id as string;
  }

  async save(normalizedDesc: string, supplierId: string): Promise<void> {
    const { data: existing, error: selectError } = await this.supabase
      .from("bank_movement_match_hints")
      .select("id, use_count")
      .match({ normalized_description: normalizedDesc, supplier_id: supplierId })
      .maybeSingle();

    if (selectError) throw new Error(selectError.message);

    if (existing) {
      const row = existing as Record<string, unknown>;
      const { error } = await this.supabase
        .from("bank_movement_match_hints")
        .update({
          use_count: (row.use_count as number) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id as string);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await this.supabase
        .from("bank_movement_match_hints")
        .insert({ normalized_description: normalizedDesc, supplier_id: supplierId });
      if (error) throw new Error(error.message);
    }
  }
}
