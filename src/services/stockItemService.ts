import type {
  StockBaseUnit,
  StockItem,
  StockItemCreateBody,
  StockItemType,
  StockItemUpdateBody,
} from "../domain/stockTypes.js";
import { getSupabase, isSupabaseConfigured } from "../infra/scoped-db/supabase-client.js";

type Row = {
  id: string;
  name: string;
  sku: string | null;
  category_id: string;
  type: string;
  is_sellable: boolean;
  sale_price: number | null;
  purchase_reference_unit_cost_with_vat: number | null;
  purchase_reference_unit_cost_without_vat: number | null;
  min_stock: number;
  base_unit: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};


type LastFromMovement = {
  withVat: number | null;
  withoutVat: number | null;
};

function roundCost(n: number): number {
  return Math.round(n * 1000000) / 1000000;
}

function rowToItem(
  row: Row,
  current_quantity?: number,
  lastEffective?: LastFromMovement
): StockItem {
  const item: StockItem = {
    id: row.id,
    name: row.name ?? "",
    sku: row.sku ?? null,
    category_id: row.category_id,
    type: row.type as StockItem["type"],
    is_sellable: Boolean(row.is_sellable),
    sale_price: row.sale_price != null ? Number(row.sale_price) : null,
    purchase_reference_unit_cost_with_vat:
      row.purchase_reference_unit_cost_with_vat != null
        ? Number(row.purchase_reference_unit_cost_with_vat)
        : null,
    purchase_reference_unit_cost_without_vat:
      row.purchase_reference_unit_cost_without_vat != null
        ? Number(row.purchase_reference_unit_cost_without_vat)
        : null,
    min_stock: Number(row.min_stock ?? 0),
    base_unit: row.base_unit as StockItem["base_unit"],
    is_active: Boolean(row.is_active),
  };
  if (row.created_at !== undefined) item.created_at = row.created_at;
  if (row.updated_at !== undefined) item.updated_at = row.updated_at;
  if (current_quantity !== undefined)
    item.current_quantity = Math.round(current_quantity * 1000) / 1000;
  if (lastEffective !== undefined) {
    item.last_purchase_unit_cost_with_vat =
      lastEffective.withVat == null ? null : roundCost(lastEffective.withVat);
    item.last_purchase_unit_cost_without_vat =
      lastEffective.withoutVat == null
        ? null
        : roundCost(lastEffective.withoutVat);
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

/** undefined = omitir; null = limpar na BD */
function parseOptionalUnitCost(
  value: unknown,
  fieldLabel: string
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${fieldLabel} inválido`);
  if (n < 0) throw new Error(`${fieldLabel} não pode ser negativo`);
  return n;
}

const ITEM_SELECT =
  "id, name, sku, category_id, type, is_sellable, sale_price, purchase_reference_unit_cost_with_vat, purchase_reference_unit_cost_without_vat, min_stock, base_unit, is_active, created_at, updated_at";

/** Última linha purchase com pelo menos um custo; devolve os dois valores dessa linha (podem ser null). */
async function getQuantitiesAndLastPurchaseFromMovements(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  itemIds: string[]
): Promise<
  Map<string, { quantity: number; lastFromMovement: LastFromMovement }>
> {
  if (!itemIds.length) return new Map();

  type RpcRow = {
    item_id: string;
    total_quantity: number;
    last_purchase_with_vat: number | null;
    last_purchase_without_vat: number | null;
  };

  const { data, error } = await supabase
    .rpc("get_stock_quantities_with_last_purchase", { p_item_ids: itemIds });
  if (error) throw new Error(`Stock quantities RPC: ${error.message}`);

  const out = new Map<
    string,
    { quantity: number; lastFromMovement: LastFromMovement }
  >();
  for (const id of itemIds) {
    out.set(id, {
      quantity: 0,
      lastFromMovement: { withVat: null, withoutVat: null },
    });
  }
  for (const row of (data ?? []) as RpcRow[]) {
    const w = row.last_purchase_with_vat != null ? Number(row.last_purchase_with_vat) : null;
    const wo = row.last_purchase_without_vat != null ? Number(row.last_purchase_without_vat) : null;
    out.set(row.item_id, {
      quantity: Number(row.total_quantity),
      lastFromMovement: { withVat: w, withoutVat: wo },
    });
  }
  return out;
}

/** Por cada componente: última compra se existir; senão referência no item. */
function effectiveLastPurchaseCosts(
  row: Row,
  lastM: LastFromMovement
): LastFromMovement {
  return {
    withVat:
      lastM.withVat != null && Number.isFinite(lastM.withVat)
        ? lastM.withVat
        : row.purchase_reference_unit_cost_with_vat != null
          ? Number(row.purchase_reference_unit_cost_with_vat)
          : null,
    withoutVat:
      lastM.withoutVat != null && Number.isFinite(lastM.withoutVat)
        ? lastM.withoutVat
        : row.purchase_reference_unit_cost_without_vat != null
          ? Number(row.purchase_reference_unit_cost_without_vat)
          : null,
  };
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
    .select(ITEM_SELECT)
    .order("name", { ascending: true });
  if (filters?.category_id) q = q.eq("category_id", filters.category_id);
  if (filters?.type) q = q.eq("type", filters.type);
  if (filters?.is_active !== undefined)
    q = q.eq("is_active", filters.is_active);
  const { data, error } = await q;
  if (error) throw new Error(`Stock items: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const itemIds = rows.map((r) => r.id);
  const qtyMap = await getQuantitiesAndLastPurchaseFromMovements(
    supabase,
    itemIds
  );
  return rows.map((r) => {
    const { quantity, lastFromMovement } = qtyMap.get(r.id) ?? {
      quantity: 0,
      lastFromMovement: { withVat: null, withoutVat: null },
    };
    return rowToItem(
      r,
      quantity,
      effectiveLastPurchaseCosts(r, lastFromMovement)
    );
  });
}

export async function getStockItem(id: string): Promise<StockItem | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("stock_items")
    .select(ITEM_SELECT)
    .eq("id", id)
    .single();
  if (error || !data) return null;
  const row = data as Row;
  const qtyMap = await getQuantitiesAndLastPurchaseFromMovements(supabase, [
    row.id,
  ]);
  const { quantity, lastFromMovement } = qtyMap.get(row.id) ?? {
    quantity: 0,
    lastFromMovement: { withVat: null, withoutVat: null },
  };
  return rowToItem(
    row,
    quantity,
    effectiveLastPurchaseCosts(row, lastFromMovement)
  );
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
  const refWith =
    body.purchase_reference_unit_cost_with_vat !== undefined
      ? parseOptionalUnitCost(
          body.purchase_reference_unit_cost_with_vat,
          "purchase_reference_unit_cost_with_vat"
        )
      : null;
  const refWithout =
    body.purchase_reference_unit_cost_without_vat !== undefined
      ? parseOptionalUnitCost(
          body.purchase_reference_unit_cost_without_vat,
          "purchase_reference_unit_cost_without_vat"
        )
      : null;
  const payload = {
    name,
    sku: (body.sku ?? "").trim() || null,
    category_id: body.category_id,
    type: body.type,
    is_sellable,
    sale_price: is_sellable ? sale_price : null,
    purchase_reference_unit_cost_with_vat: refWith ?? null,
    purchase_reference_unit_cost_without_vat: refWithout ?? null,
    min_stock: Number(body.min_stock) ?? 0,
    base_unit: body.base_unit,
    is_active: body.is_active !== false,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("stock_items")
    .insert(payload)
    .select(ITEM_SELECT)
    .single();
  if (error) throw new Error(`Criar item: ${error.message}`);
  const created = data as Row;
  return rowToItem(
    created,
    0,
    effectiveLastPurchaseCosts(created, { withVat: null, withoutVat: null })
  );
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
  if (body.purchase_reference_unit_cost_with_vat !== undefined) {
    updates.purchase_reference_unit_cost_with_vat = parseOptionalUnitCost(
      body.purchase_reference_unit_cost_with_vat,
      "purchase_reference_unit_cost_with_vat"
    ) as number | null;
  }
  if (body.purchase_reference_unit_cost_without_vat !== undefined) {
    updates.purchase_reference_unit_cost_without_vat = parseOptionalUnitCost(
      body.purchase_reference_unit_cost_without_vat,
      "purchase_reference_unit_cost_without_vat"
    ) as number | null;
  }
  if (body.min_stock !== undefined)
    updates.min_stock = Number(body.min_stock) ?? 0;
  if (body.base_unit !== undefined) updates.base_unit = body.base_unit;
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  const { data, error } = await supabase
    .from("stock_items")
    .update(updates)
    .eq("id", id)
    .select(ITEM_SELECT)
    .single();
  if (error) throw new Error(`Atualizar item: ${error.message}`);
  if (!data) throw new Error("Item não encontrado");
  const qtyMap = await getQuantitiesAndLastPurchaseFromMovements(supabase, [
    id,
  ]);
  const row = data as Row;
  const { quantity, lastFromMovement } = qtyMap.get(id) ?? {
    quantity: 0,
    lastFromMovement: { withVat: null, withoutVat: null },
  };
  return rowToItem(
    row,
    quantity,
    effectiveLastPurchaseCosts(row, lastFromMovement)
  );
}

export async function deleteStockItem(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from("stock_items").delete().eq("id", id);
  if (error) throw new Error(`Eliminar item: ${error.message}`);
}
