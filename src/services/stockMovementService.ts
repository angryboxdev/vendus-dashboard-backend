import { getSupabase, isSupabaseConfigured } from "../infra/supabaseClient.js";
import type { StockMovement, StockMovementCreateBody, StockMovementType } from "../domain/stockTypes.js";

type Row = {
  id: string;
  item_id: string;
  type: string;
  quantity: number;
  unit_cost_per_base_unit: number | null;
  reason: string | null;
  reference: string | null;
  created_at: string;
  created_by: string | null;
};

function rowToMovement(row: Row): StockMovement {
  return {
    id: row.id,
    item_id: row.item_id,
    type: row.type as StockMovementType,
    quantity: Number(row.quantity),
    unit_cost_per_base_unit: row.unit_cost_per_base_unit != null ? Number(row.unit_cost_per_base_unit) : null,
    reason: row.reason ?? null,
    reference: row.reference ?? null,
    created_at: row.created_at,
    created_by: row.created_by ?? null,
  };
}

function requireSupabase(): NonNullable<ReturnType<typeof getSupabase>> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase não configurado: defina SUPABASE_URL e SUPABASE_ANON_KEY");
  }
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase não disponível");
  return supabase;
}

const MOVEMENT_TYPES: StockMovementType[] = [
  "purchase", "consumption", "sale", "loss", "adjustment", "transfer",
];

export function validateMovementType(t: string): t is StockMovementType {
  return MOVEMENT_TYPES.includes(t as StockMovementType);
}

export async function createStockMovement(body: StockMovementCreateBody): Promise<StockMovement> {
  const supabase = requireSupabase();
  if (!body.item_id) throw new Error("item_id é obrigatório");
  if (!validateMovementType(body.type)) throw new Error(`type inválido: ${body.type}`);
  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity)) throw new Error("quantity inválido");
  const payload = {
    item_id: body.item_id,
    type: body.type,
    quantity,
    unit_cost_per_base_unit: body.unit_cost_per_base_unit != null ? Number(body.unit_cost_per_base_unit) : null,
    reason: (body.reason ?? "").trim() || null,
    reference: (body.reference ?? "").trim() || null,
    created_by: (body.created_by ?? "").trim() || null,
  };
  const { data, error } = await supabase
    .from("stock_movements")
    .insert(payload)
    .select("id, item_id, type, quantity, unit_cost_per_base_unit, reason, reference, created_at, created_by")
    .single();
  if (error) throw new Error(`Criar movimentação: ${error.message}`);
  return rowToMovement(data as Row);
}

export async function listStockMovementsByItem(
  itemId: string,
  limit = 100
): Promise<StockMovement[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id, item_id, type, quantity, unit_cost_per_base_unit, reason, reference, created_at, created_by")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Stock movements: ${error.message}`);
  return ((data ?? []) as Row[]).map(rowToMovement);
}
