import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupplierHintPort } from "../../domain/ports/out/supplier-hint.port.js";
import type { SupplierSummary } from "../../domain/ports/out/supplier-lookup.port.js";

export class SupabaseSupplierHintAdapter implements SupplierHintPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async findByNormalizedName(normalizedName: string): Promise<SupplierSummary | null> {
    const { data: hint, error: hintError } = await this.supabase
      .from("supplier_import_hints")
      .select("supplier_id")
      .eq("normalized_name", normalizedName)
      .order("use_count", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (hintError) throw new Error(hintError.message);
    if (!hint) return null;

    const supplierId = (hint as Record<string, unknown>).supplier_id as string;

    const { data: supplier, error: supplierError } = await this.supabase
      .from("suppliers")
      .select("id, name, nif, default_cost_center_group_id, default_cost_center_category_id, default_financial_type")
      .eq("id", supplierId)
      .maybeSingle();

    if (supplierError) throw new Error(supplierError.message);
    if (!supplier) return null;

    const s = supplier as Record<string, unknown>;
    return {
      id: s.id as string,
      name: s.name as string,
      nif: (s.nif as string | null) ?? null,
      defaultCostCenterGroupId: (s.default_cost_center_group_id as string | null) ?? null,
      defaultCostCenterCategoryId: (s.default_cost_center_category_id as string | null) ?? null,
      defaultFinancialType: (s.default_financial_type as string | null) ?? null,
    };
  }

  async save(normalizedName: string, supplierId: string): Promise<void> {
    const { data: existing, error: selectError } = await this.supabase
      .from("supplier_import_hints")
      .select("id, use_count")
      .match({ normalized_name: normalizedName, supplier_id: supplierId })
      .maybeSingle();

    if (selectError) throw new Error(selectError.message);

    if (existing) {
      const row = existing as Record<string, unknown>;
      const { error } = await this.supabase
        .from("supplier_import_hints")
        .update({
          use_count: (row.use_count as number) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id as string);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await this.supabase
        .from("supplier_import_hints")
        .insert({ normalized_name: normalizedName, supplier_id: supplierId });
      if (error) throw new Error(error.message);
    }
  }
}
