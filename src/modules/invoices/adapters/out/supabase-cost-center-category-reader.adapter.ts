import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategorySnapshot } from "../../domain/entities/invoice-line.js";
import type { CategoryLookup, CostCenterCategoryReaderPort } from "../../domain/ports/out/cost-center-category-reader.port.js";

export class SupabaseCostCenterCategoryReaderAdapter implements CostCenterCategoryReaderPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async findById(id: string): Promise<CategorySnapshot | null> {
    const { data, error } = await this.supabase
      .from("cost_center_categories")
      .select("id, financial_type, affects_dre, affects_cashflow, affects_profitability, requires_channel, requires_allocation")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
      id: row.id as string,
      financialType: row.financial_type as string,
      affectsDre: Boolean(row.affects_dre),
      affectsCashflow: Boolean(row.affects_cashflow),
      affectsProfitability: Boolean(row.affects_profitability),
      requiresChannel: Boolean(row.requires_channel),
      requiresAllocation: Boolean(row.requires_allocation),
    };
  }

  async findManyByIds(ids: string[]): Promise<CategoryLookup[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.supabase
      .from("cost_center_categories")
      .select("id, code, name, financial_type")
      .in("id", ids);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      code: row.code as string,
      name: row.name as string,
      financialType: (row.financial_type as string | null) ?? null,
    }));
  }
}
