import { getSupabase, isSupabaseConfigured } from "../infra/scoped-db/supabase-client.js";
import type {
  Preparation,
  PreparationCreateBody,
  PreparationItem,
  PreparationItemCreateBody,
  PreparationItemUpdateBody,
  PreparationUpdateBody,
} from "../domain/preparationTypes.js";

// -----------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------

function requireSupabase(): NonNullable<ReturnType<typeof getSupabase>> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase não configurado: defina SUPABASE_URL e SUPABASE_ANON_KEY");
  }
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase não disponível");
  return supabase;
}

type PreparationRow = {
  id: string;
  name: string;
  description: string | null;
  yield_qty: number;
  yield_unit: string;
  use_as_unit: boolean;
  created_at?: string;
  updated_at?: string;
};

function rowToPreparation(row: PreparationRow): Preparation {
  const p: Preparation = {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    yield_qty: Number(row.yield_qty),
    yield_unit: row.yield_unit,
    use_as_unit: Boolean(row.use_as_unit),
  };
  if (row.created_at !== undefined) p.created_at = row.created_at;
  if (row.updated_at !== undefined) p.updated_at = row.updated_at;
  return p;
}

type PreparationItemRow = {
  id: string;
  preparation_id: string;
  stock_item_id: string;
  quantity: number;
  created_at?: string;
};

function rowToPreparationItem(row: PreparationItemRow): PreparationItem {
  const item: PreparationItem = {
    id: row.id,
    preparation_id: row.preparation_id,
    stock_item_id: row.stock_item_id,
    quantity: Number(row.quantity),
  };
  if (row.created_at !== undefined) item.created_at = row.created_at;
  return item;
}

const PREPARATION_COLS = "id, name, description, yield_qty, yield_unit, use_as_unit, created_at, updated_at";
const PREPARATION_ITEM_COLS = "id, preparation_id, stock_item_id, quantity, created_at";

// -----------------------------------------------------------------------
// Preparations CRUD
// -----------------------------------------------------------------------

export async function listPreparations(): Promise<Preparation[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("preparations")
    .select(PREPARATION_COLS)
    .order("name", { ascending: true });
  if (error) throw new Error(`Listar preparos: ${error.message}`);
  return ((data ?? []) as PreparationRow[]).map(rowToPreparation);
}

export async function getPreparation(id: string): Promise<Preparation | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("preparations")
    .select(PREPARATION_COLS)
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return rowToPreparation(data as PreparationRow);
}

export async function createPreparation(body: PreparationCreateBody): Promise<Preparation> {
  const supabase = requireSupabase();
  if (!body.name?.trim()) throw new Error("name é obrigatório");
  const yield_qty = Number(body.yield_qty);
  if (!Number.isFinite(yield_qty) || yield_qty <= 0) throw new Error("yield_qty deve ser positivo");
  if (!body.yield_unit?.trim()) throw new Error("yield_unit é obrigatório");
  const { data, error } = await supabase
    .from("preparations")
    .insert({
      name: body.name.trim(),
      description: body.description ?? null,
      yield_qty,
      yield_unit: body.yield_unit.trim(),
      use_as_unit: body.use_as_unit === true,
    })
    .select(PREPARATION_COLS)
    .single();
  if (error) throw new Error(`Criar preparo: ${error.message}`);
  return rowToPreparation(data as PreparationRow);
}

export async function updatePreparation(id: string, body: PreparationUpdateBody): Promise<Preparation> {
  const supabase = requireSupabase();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    if (!body.name?.trim()) throw new Error("name não pode ser vazio");
    updates.name = body.name.trim();
  }
  if (body.description !== undefined) updates.description = body.description ?? null;
  if (body.yield_qty !== undefined) {
    const yield_qty = Number(body.yield_qty);
    if (!Number.isFinite(yield_qty) || yield_qty <= 0) throw new Error("yield_qty deve ser positivo");
    updates.yield_qty = yield_qty;
  }
  if (body.yield_unit !== undefined) {
    if (!body.yield_unit?.trim()) throw new Error("yield_unit não pode ser vazio");
    updates.yield_unit = body.yield_unit.trim();
  }
  if (body.use_as_unit !== undefined) {
    updates.use_as_unit = body.use_as_unit === true;
  }
  const { data, error } = await supabase
    .from("preparations")
    .update(updates)
    .eq("id", id)
    .select(PREPARATION_COLS)
    .single();
  if (error) throw new Error(`Atualizar preparo: ${error.message}`);
  if (!data) throw new Error("Preparo não encontrado");
  return rowToPreparation(data as PreparationRow);
}

export async function deletePreparation(id: string): Promise<void> {
  const supabase = requireSupabase();
  // Verificar se está em uso em alguma receita de pizza
  const { data: usages, error: usageErr } = await supabase
    .from("pizza_recipe_items")
    .select("id")
    .eq("preparation_id", id)
    .limit(1);
  if (usageErr) throw new Error(`Verificar uso do preparo: ${usageErr.message}`);
  if (usages && usages.length > 0) {
    throw new Error("Este preparo está a ser usado numa receita de pizza e não pode ser eliminado");
  }
  const { error } = await supabase.from("preparations").delete().eq("id", id);
  if (error) throw new Error(`Eliminar preparo: ${error.message}`);
}

// -----------------------------------------------------------------------
// Preparation items CRUD
// -----------------------------------------------------------------------

export async function listPreparationItems(preparationId: string): Promise<PreparationItem[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("preparation_items")
    .select(PREPARATION_ITEM_COLS)
    .eq("preparation_id", preparationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Listar ingredientes do preparo: ${error.message}`);
  return ((data ?? []) as PreparationItemRow[]).map(rowToPreparationItem);
}

export async function getPreparationItem(id: string): Promise<PreparationItem | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("preparation_items")
    .select(PREPARATION_ITEM_COLS)
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return rowToPreparationItem(data as PreparationItemRow);
}

export async function createPreparationItem(body: PreparationItemCreateBody): Promise<PreparationItem> {
  const supabase = requireSupabase();
  if (!body.preparation_id) throw new Error("preparation_id é obrigatório");
  if (!body.stock_item_id) throw new Error("stock_item_id é obrigatório");
  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("quantity deve ser positivo");
  const { data, error } = await supabase
    .from("preparation_items")
    .insert({ preparation_id: body.preparation_id, stock_item_id: body.stock_item_id, quantity })
    .select(PREPARATION_ITEM_COLS)
    .single();
  if (error) throw new Error(`Criar ingrediente do preparo: ${error.message}`);
  return rowToPreparationItem(data as PreparationItemRow);
}

export async function updatePreparationItem(id: string, body: PreparationItemUpdateBody): Promise<PreparationItem> {
  const supabase = requireSupabase();
  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("quantity deve ser positivo");
  const { data, error } = await supabase
    .from("preparation_items")
    .update({ quantity })
    .eq("id", id)
    .select(PREPARATION_ITEM_COLS)
    .single();
  if (error) throw new Error(`Atualizar ingrediente do preparo: ${error.message}`);
  if (!data) throw new Error("Ingrediente não encontrado");
  return rowToPreparationItem(data as PreparationItemRow);
}

export async function deletePreparationItem(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from("preparation_items").delete().eq("id", id);
  if (error) throw new Error(`Eliminar ingrediente do preparo: ${error.message}`);
}

// -----------------------------------------------------------------------
// Helper usado pelo ingredientConsumptionService
// -----------------------------------------------------------------------

export type PreparationWithItems = Preparation & { items: PreparationItem[] };

export async function getPreparationWithItems(id: string): Promise<PreparationWithItems | null> {
  const [preparation, items] = await Promise.all([
    getPreparation(id),
    listPreparationItems(id),
  ]);
  if (!preparation) return null;
  return { ...preparation, items };
}
