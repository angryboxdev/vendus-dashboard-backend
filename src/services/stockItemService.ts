import type {
  StockBaseUnit,
  StockItem,
  StockItemCreateBody,
  StockItemType,
  StockItemUpdateBody,
} from "../domain/stockTypes.js";
import { getSupabase, isSupabaseConfigured } from "../infra/supabaseClient.js";

type Row = {
  id: string;
  name: string;
  sku: string | null;
  category_id: string;
  type: string;
  is_sellable: boolean;
  sale_price: number | null;
  min_stock: number;
  base_unit: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

type MovementRow = {
  item_id: string;
  quantity: number;
  type: string;
  unit_cost_per_base_unit: number | null;
};

function rowToItem(
  row: Row,
  current_quantity?: number,
  average_cost?: number | null
): StockItem {
  const item: StockItem = {
    id: row.id,
    name: row.name ?? "",
    sku: row.sku ?? null,
    category_id: row.category_id,
    type: row.type as StockItem["type"],
    is_sellable: Boolean(row.is_sellable),
    sale_price: row.sale_price != null ? Number(row.sale_price) : null,
    min_stock: Number(row.min_stock ?? 0),
    base_unit: row.base_unit as StockItem["base_unit"],
    is_active: Boolean(row.is_active),
  };
  if (row.created_at !== undefined) item.created_at = row.created_at;
  if (row.updated_at !== undefined) item.updated_at = row.updated_at;
  if (current_quantity !== undefined)
    item.current_quantity = Math.round(current_quantity * 1000) / 1000;
  if (average_cost !== undefined) {
    item.average_cost_per_base_unit =
      average_cost == null
        ? null
        : Math.round(average_cost * 1000000) / 1000000;
  }
  return item;
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

const ITEM_TYPES: StockItemType[] = [
  "ingredient",
  "beverage",
  "packaging",
  "cleaning",
  "other",
];
const BASE_UNITS: StockBaseUnit[] = ["g", "kg", "ml", "l", "un", "cl"];

export function validateItemType(t: string): t is StockItemType {
  return ITEM_TYPES.includes(t as StockItemType);
}
export function validateBaseUnit(u: string): u is StockBaseUnit {
  return BASE_UNITS.includes(u as StockBaseUnit);
}

/** Calcula quantidade atual e custo médio (média ponderada de compras) por item a partir de movimentos */
async function getQuantitiesAndCosts(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  itemIds: string[]
): Promise<Map<string, { quantity: number; avgCost: number | null }>> {
  if (!itemIds.length) return new Map();
  const { data: movements, error } = await supabase
    .from("stock_movements")
    .select("item_id, quantity, type, unit_cost_per_base_unit")
    .in("item_id", itemIds);
  if (error) throw new Error(`Stock movements: ${error.message}`);
  const rows = (movements ?? []) as MovementRow[];
  const byItem = new Map<
    string,
    { quantity: number; avgCost: number | null }
  >();
  for (const id of itemIds) {
    byItem.set(id, { quantity: 0, avgCost: null });
  }
  for (const m of rows) {
    const cur = byItem.get(m.item_id)!;
    cur.quantity += Number(m.quantity);
  }
  // Custo médio ponderado: só compras (purchase), avg = sum(qty*cost)/sum(qty)
  const purchaseByItem = new Map<
    string,
    { sumQty: number; sumQtyCost: number }
  >();
  for (const m of rows) {
    if (m.type !== "purchase" || m.unit_cost_per_base_unit == null) continue;
    const qty = Number(m.quantity);
    const cost = Number(m.unit_cost_per_base_unit);
    if (qty <= 0) continue;
    let p = purchaseByItem.get(m.item_id);
    if (!p) {
      p = { sumQty: 0, sumQtyCost: 0 };
      purchaseByItem.set(m.item_id, p);
    }
    p.sumQty += qty;
    p.sumQtyCost += qty * cost;
  }
  for (const [id, p] of purchaseByItem) {
    const cur = byItem.get(id);
    if (cur && p.sumQty > 0) {
      cur.avgCost = p.sumQtyCost / p.sumQty;
    }
  }
  return byItem;
}

export async function listStockItems(filters?: {
  category_id?: string;
  type?: StockItemType;
  is_active?: boolean;
}): Promise<StockItem[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  if (!supabase) return [];
  let q = supabase
    .from("stock_items")
    .select(
      "id, name, sku, category_id, type, is_sellable, sale_price, min_stock, base_unit, is_active, created_at, updated_at"
    )
    .order("name", { ascending: true });
  if (filters?.category_id) q = q.eq("category_id", filters.category_id);
  if (filters?.type) q = q.eq("type", filters.type);
  if (filters?.is_active !== undefined)
    q = q.eq("is_active", filters.is_active);
  const { data, error } = await q;
  if (error) throw new Error(`Stock items: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const itemIds = rows.map((r) => r.id);
  const qtyMap = await getQuantitiesAndCosts(supabase, itemIds);
  return rows.map((r) => {
    const { quantity, avgCost } = qtyMap.get(r.id) ?? {
      quantity: 0,
      avgCost: null,
    };
    return rowToItem(r, quantity, avgCost);
  });
}

export async function getStockItem(id: string): Promise<StockItem | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("stock_items")
    .select(
      "id, name, sku, category_id, type, is_sellable, sale_price, min_stock, base_unit, is_active, created_at, updated_at"
    )
    .eq("id", id)
    .single();
  if (error || !data) return null;
  const row = data as Row;
  const qtyMap = await getQuantitiesAndCosts(supabase, [row.id]);
  const { quantity, avgCost } = qtyMap.get(row.id) ?? {
    quantity: 0,
    avgCost: null,
  };
  return rowToItem(row, quantity, avgCost);
}

export async function createStockItem(
  body: StockItemCreateBody
): Promise<StockItem> {
  const supabase = requireSupabase();
  const name = (body.name ?? "").trim();
  if (!name) throw new Error("name é obrigatório");
  if (!body.category_id) throw new Error("category_id é obrigatório");
  if (!validateItemType(body.type))
    throw new Error(`type inválido: ${body.type}`);
  if (!validateBaseUnit(body.base_unit))
    throw new Error(`base_unit inválido: ${body.base_unit}`);
  const is_sellable = Boolean(body.is_sellable);
  const sale_price = body.sale_price != null ? Number(body.sale_price) : null;
  const payload = {
    name,
    sku: (body.sku ?? "").trim() || null,
    category_id: body.category_id,
    type: body.type,
    is_sellable,
    sale_price: is_sellable ? sale_price : null,
    min_stock: Number(body.min_stock) ?? 0,
    base_unit: body.base_unit,
    is_active: body.is_active !== false,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("stock_items")
    .insert(payload)
    .select(
      "id, name, sku, category_id, type, is_sellable, sale_price, min_stock, base_unit, is_active, created_at, updated_at"
    )
    .single();
  if (error) throw new Error(`Criar item: ${error.message}`);
  return rowToItem(data as Row, 0, null);
}

export async function updateStockItem(
  id: string,
  body: StockItemUpdateBody
): Promise<StockItem> {
  const supabase = requireSupabase();
  if (body.type != null && !validateItemType(body.type))
    throw new Error(`type inválido: ${body.type}`);
  if (body.base_unit != null && !validateBaseUnit(body.base_unit))
    throw new Error(`base_unit inválido: ${body.base_unit}`);
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.name !== undefined) updates.name = (body.name ?? "").trim();
  if (body.sku !== undefined) updates.sku = (body.sku ?? "").trim() || null;
  if (body.category_id !== undefined) updates.category_id = body.category_id;
  if (body.type !== undefined) updates.type = body.type;
  if (body.is_sellable !== undefined) {
    updates.is_sellable = body.is_sellable;
    if (body.is_sellable === false) updates.sale_price = null;
  }
  if (body.sale_price !== undefined) {
    updates.sale_price =
      body.is_sellable === false
        ? null
        : body.sale_price != null
        ? Number(body.sale_price)
        : null;
  }
  if (body.min_stock !== undefined)
    updates.min_stock = Number(body.min_stock) ?? 0;
  if (body.base_unit !== undefined) updates.base_unit = body.base_unit;
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  const { data, error } = await supabase
    .from("stock_items")
    .update(updates)
    .eq("id", id)
    .select(
      "id, name, sku, category_id, type, is_sellable, sale_price, min_stock, base_unit, is_active, created_at, updated_at"
    )
    .single();
  if (error) throw new Error(`Atualizar item: ${error.message}`);
  if (!data) throw new Error("Item não encontrado");
  const qtyMap = await getQuantitiesAndCosts(supabase, [id]);
  const { quantity, avgCost } = qtyMap.get(id) ?? {
    quantity: 0,
    avgCost: null,
  };
  return rowToItem(data as Row, quantity, avgCost);
}

export async function deleteStockItem(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from("stock_items").delete().eq("id", id);
  if (error) throw new Error(`Eliminar item: ${error.message}`);
}
