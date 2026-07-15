import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupplierLookupPort, SupplierSummary } from "../../domain/ports/out/supplier-lookup.port.js";

function toSummary(row: Record<string, unknown>): SupplierSummary {
  return {
    id: row.id as string,
    name: row.name as string,
    nif: (row.nif as string | null) ?? null,
    defaultCostCenterGroupId: (row.default_cost_center_group_id as string | null) ?? null,
    defaultCostCenterCategoryId: (row.default_cost_center_category_id as string | null) ?? null,
    defaultFinancialType: (row.default_financial_type as string | null) ?? null,
  };
}

export class SupabaseSupplierLookupAdapter implements SupplierLookupPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async findByNif(nif: string): Promise<SupplierSummary | null> {
    const { data, error } = await this.supabase
      .from("suppliers")
      .select("id, name, nif, default_cost_center_group_id, default_cost_center_category_id, default_financial_type")
      .eq("nif", nif)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return toSummary(data as Record<string, unknown>);
  }

  async findByName(query: string): Promise<SupplierSummary[]> {
    const { data, error } = await this.supabase
      .from("suppliers")
      .select("id, name, nif, default_cost_center_group_id, default_cost_center_category_id, default_financial_type")
      .ilike("name", `%${query}%`)
      .limit(10);

    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toSummary(r as Record<string, unknown>));
  }

  async findAll(): Promise<SupplierSummary[]> {
    const { data, error } = await this.supabase
      .from("suppliers")
      .select("id, name, nif, default_cost_center_group_id, default_cost_center_category_id, default_financial_type");

    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toSummary(r as Record<string, unknown>));
  }
}
