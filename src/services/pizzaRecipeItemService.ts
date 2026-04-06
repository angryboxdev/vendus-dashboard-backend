import { getSupabase, isSupabaseConfigured } from "../infra/supabaseClient.js";
import type {
  PizzaRecipeItem,
  PizzaRecipeItemCreateBody,
  PizzaRecipeItemUpdateBody,
  PizzaSize,
} from "../domain/pizzaTypes.js";
import { validatePizzaSize } from "./pizzaPriceService.js";

type Row = {
  id: string;
  recipe_id: string;
  stock_item_id: string | null;
  preparation_id: string | null;
  size: string;
  quantity: number;
  waste_factor: number | null;
  is_optional: boolean;
  created_at?: string;
};

function rowToItem(row: Row): PizzaRecipeItem {
  const r: PizzaRecipeItem = {
    id: row.id,
    recipe_id: row.recipe_id,
    stock_item_id: row.stock_item_id ?? null,
    preparation_id: row.preparation_id ?? null,
    size: row.size as PizzaSize,
    quantity: Number(row.quantity),
    waste_factor: row.waste_factor != null ? Number(row.waste_factor) : null,
    is_optional: Boolean(row.is_optional),
  };
  if (row.created_at !== undefined) r.created_at = row.created_at;
  return r;
}

function requireSupabase(): NonNullable<ReturnType<typeof getSupabase>> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase não configurado: defina SUPABASE_URL e SUPABASE_ANON_KEY");
  }
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase não disponível");
  return supabase;
}

const SELECT_COLS = "id, recipe_id, stock_item_id, preparation_id, size, quantity, waste_factor, is_optional, created_at";

export async function listPizzaRecipeItems(recipeId: string): Promise<PizzaRecipeItem[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("pizza_recipe_items")
    .select(SELECT_COLS)
    .eq("recipe_id", recipeId)
    .order("size", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Pizza recipe items: ${error.message}`);
  return ((data ?? []) as Row[]).map(rowToItem);
}

export async function getPizzaRecipeItem(id: string): Promise<PizzaRecipeItem | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("pizza_recipe_items")
    .select(SELECT_COLS)
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return rowToItem(data as Row);
}

export async function createPizzaRecipeItem(body: PizzaRecipeItemCreateBody): Promise<PizzaRecipeItem> {
  const supabase = requireSupabase();
  if (!body.recipe_id) throw new Error("recipe_id é obrigatório");
  if (!validatePizzaSize(body.size)) throw new Error(`size inválido: ${body.size}`);
  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("quantity deve ser positivo");

  const hasStock = !!body.stock_item_id;
  const hasPrep = !!body.preparation_id;
  if (hasStock === hasPrep) {
    throw new Error("Exatamente um de stock_item_id ou preparation_id deve ser fornecido");
  }

  const payload: Record<string, unknown> = {
    recipe_id: body.recipe_id,
    size: body.size,
    quantity,
    waste_factor: body.waste_factor != null ? Number(body.waste_factor) : null,
    is_optional: body.is_optional === true,
    stock_item_id: body.stock_item_id ?? null,
    preparation_id: body.preparation_id ?? null,
  };

  const { data, error } = await supabase
    .from("pizza_recipe_items")
    .insert(payload)
    .select(SELECT_COLS)
    .single();
  if (error) throw new Error(`Criar item receita: ${error.message}`);
  return rowToItem(data as Row);
}

export async function updatePizzaRecipeItem(id: string, body: PizzaRecipeItemUpdateBody): Promise<PizzaRecipeItem> {
  const supabase = requireSupabase();
  const updates: Record<string, unknown> = {};
  if (body.quantity !== undefined) {
    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("quantity deve ser positivo");
    updates.quantity = quantity;
  }
  if (body.waste_factor !== undefined) updates.waste_factor = body.waste_factor != null ? Number(body.waste_factor) : null;
  if (body.is_optional !== undefined) updates.is_optional = body.is_optional;
  if (Object.keys(updates).length === 0) {
    const existing = await getPizzaRecipeItem(id);
    if (!existing) throw new Error("Item não encontrado");
    return existing;
  }
  const { data, error } = await supabase
    .from("pizza_recipe_items")
    .update(updates)
    .eq("id", id)
    .select(SELECT_COLS)
    .single();
  if (error) throw new Error(`Atualizar item receita: ${error.message}`);
  if (!data) throw new Error("Item não encontrado");
  return rowToItem(data as Row);
}

export async function deletePizzaRecipeItem(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from("pizza_recipe_items").delete().eq("id", id);
  if (error) throw new Error(`Eliminar item receita: ${error.message}`);
}
