import type {
  StockMovement,
  StockMovementCreateBody,
  StockMovementType,
  StockMovementUpdateBody,
} from "../domain/stockTypes.js";
import { getSupabase, isSupabaseConfigured } from "../infra/supabaseClient.js";

type Row = {
  id: string;
  item_id: string;
  type: string;
  quantity: number;
  unit_cost_per_base_unit: number | null;
  reason: string | null;
  reference: string | null;
  movement_date: string;
  created_at: string;
  created_by: string | null;
};

const COLS =
  "id, item_id, type, quantity, unit_cost_per_base_unit, reason, reference, movement_date, created_at, created_by";

function rowToMovement(row: Row): StockMovement {
  return {
    id: row.id,
    item_id: row.item_id,
    type: row.type as StockMovementType,
    quantity: Number(row.quantity),
    unit_cost_per_base_unit:
      row.unit_cost_per_base_unit != null
        ? Number(row.unit_cost_per_base_unit)
        : null,
    reason: row.reason ?? null,
    reference: row.reference ?? null,
    movement_date: row.movement_date,
    created_at: row.created_at,
    created_by: row.created_by ?? null,
  };
}

/** Valida e devolve ISO string para movement_date ou null (usa default no DB) */
function parseMovementDate(value: string | null | undefined): string | null {
  if (value == null || (typeof value === "string" && value.trim() === ""))
    return null;
  const s = String(value).trim();
  const date = new Date(s);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function requireSupabase(): NonNullable<ReturnType<typeof getSupabase>> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase não configurado: defina SUPABASE_URL e SUPABASE_ANON_KEY"
    );
  }
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase não disponível");
  return supabase;
}

const MOVEMENT_TYPES: StockMovementType[] = [
  "purchase",
  "consumption",
  "sale",
  "loss",
  "adjustment",
  "transfer",
];

export function validateMovementType(t: string): t is StockMovementType {
  return MOVEMENT_TYPES.includes(t as StockMovementType);
}

export async function createStockMovement(
  body: StockMovementCreateBody
): Promise<StockMovement> {
  const supabase = requireSupabase();
  if (!body.item_id) throw new Error("item_id é obrigatório");
  if (!validateMovementType(body.type))
    throw new Error(`type inválido: ${body.type}`);
  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity)) throw new Error("quantity inválido");
  const movementDate = parseMovementDate(body.movement_date);
  const payload: Record<string, unknown> = {
    item_id: body.item_id,
    type: body.type,
    quantity,
    unit_cost_per_base_unit:
      body.unit_cost_per_base_unit != null
        ? Number(body.unit_cost_per_base_unit)
        : null,
    reason: (body.reason ?? "").trim() || null,
    reference: (body.reference ?? "").trim() || null,
    created_by: (body.created_by ?? "").trim() || null,
  };
  if (movementDate) payload.movement_date = movementDate;
  const { data, error } = await supabase
    .from("stock_movements")
    .insert(payload)
    .select(COLS)
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
    .select(COLS)
    .eq("item_id", itemId)
    .order("movement_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Stock movements: ${error.message}`);
  return ((data ?? []) as Row[]).map(rowToMovement);
}

export async function getStockMovementById(
  id: string
): Promise<StockMovement | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("stock_movements")
    .select(COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Movimentação: ${error.message}`);
  return data ? rowToMovement(data as Row) : null;
}

export async function updateStockMovement(
  id: string,
  body: StockMovementUpdateBody
): Promise<StockMovement> {
  const supabase = requireSupabase();
  const updates: Record<string, unknown> = {};
  if (body.movement_date !== undefined) {
    const v = parseMovementDate(body.movement_date);
    updates.movement_date = v ?? new Date().toISOString();
  }
  if (body.quantity !== undefined) {
    const q = Number(body.quantity);
    if (!Number.isFinite(q)) throw new Error("quantity inválido");
    updates.quantity = q;
  }
  if (body.unit_cost_per_base_unit !== undefined)
    updates.unit_cost_per_base_unit =
      body.unit_cost_per_base_unit == null
        ? null
        : Number(body.unit_cost_per_base_unit);
  if (body.reason !== undefined)
    updates.reason = (body.reason ?? "").trim() || null;
  if (body.reference !== undefined)
    updates.reference = (body.reference ?? "").trim() || null;
  if (Object.keys(updates).length === 0) {
    const existing = await getStockMovementById(id);
    if (!existing) throw new Error("Movimentação não encontrada");
    return existing;
  }
  const { data, error } = await supabase
    .from("stock_movements")
    .update(updates)
    .eq("id", id)
    .select(COLS)
    .single();
  if (error) throw new Error(`Atualizar movimentação: ${error.message}`);
  return rowToMovement(data as Row);
}
