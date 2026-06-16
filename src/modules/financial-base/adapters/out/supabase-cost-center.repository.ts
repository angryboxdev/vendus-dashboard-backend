import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CostCenter,
  type CostCenterCategory,
  type CostCenterStatus,
} from "../../domain/entities/cost-center.js";
import type {
  CostCenterFilter,
  CostCenterRepositoryPort,
} from "../../domain/ports/out/cost-center-repository.port.js";

function toEntity(row: Record<string, unknown>): CostCenter {
  return CostCenter.reconstitute({
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    category: row.category as CostCenterCategory,
    subcategory: (row.subcategory as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    responsibleName: (row.responsible_name as string | null) ?? null,
    status: row.status as CostCenterStatus,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });
}

export class SupabaseCostCenterRepository implements CostCenterRepositoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async save(costCenter: CostCenter): Promise<void> {
    const { error } = await this.supabase.from("cost_centers").insert({
      id: costCenter.id,
      code: costCenter.code,
      name: costCenter.name,
      category: costCenter.category,
      subcategory: costCenter.subcategory,
      description: costCenter.description,
      responsible_name: costCenter.responsibleName,
      status: costCenter.status,
      created_at: costCenter.createdAt.toISOString(),
      updated_at: costCenter.updatedAt.toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  async findById(id: string): Promise<CostCenter | null> {
    const { data, error } = await this.supabase
      .from("cost_centers")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as Record<string, unknown>);
  }

  async findByCode(code: string): Promise<CostCenter | null> {
    const { data, error } = await this.supabase
      .from("cost_centers")
      .select("*")
      .eq("code", code.trim().toUpperCase())
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as Record<string, unknown>);
  }

  async findAll(filter?: CostCenterFilter): Promise<CostCenter[]> {
    let q = this.supabase
      .from("cost_centers")
      .select("*")
      .order("name", { ascending: true });

    if (filter?.category) q = q.eq("category", filter.category);
    if (filter?.status) q = q.eq("status", filter.status);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toEntity(r as Record<string, unknown>));
  }

  async update(costCenter: CostCenter): Promise<void> {
    const { error } = await this.supabase
      .from("cost_centers")
      .update({
        name: costCenter.name,
        category: costCenter.category,
        subcategory: costCenter.subcategory,
        description: costCenter.description,
        responsible_name: costCenter.responsibleName,
        status: costCenter.status,
        updated_at: costCenter.updatedAt.toISOString(),
      })
      .eq("id", costCenter.id);
    if (error) throw new Error(error.message);
  }
}
