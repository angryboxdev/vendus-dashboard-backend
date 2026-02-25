import { getSupabase, isSupabaseConfigured } from "../infra/supabaseClient.js";
import type {
  StockCategory,
  StockCategoryCreateBody,
  StockCategoryUpdateBody,
} from "../domain/stockTypes.js";

type Row = { id: string; name: string };

function rowToCategory(row: Row): StockCategory {
  return { id: row.id, name: row.name ?? "" };
}

function requireSupabase(): NonNullable<ReturnType<typeof getSupabase>> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase não configurado: defina SUPABASE_URL e SUPABASE_ANON_KEY");
  }
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase não disponível");
  return supabase;
}

export async function listStockCategories(): Promise<StockCategory[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("stock_categories")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw new Error(`Stock categories: ${error.message}`);
  return ((data ?? []) as Row[]).map(rowToCategory);
}

export async function getStockCategory(id: string): Promise<StockCategory | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("stock_categories")
    .select("id, name")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return rowToCategory(data as Row);
}

export async function createStockCategory(
  body: StockCategoryCreateBody
): Promise<StockCategory> {
  const supabase = requireSupabase();
  const name = (body.name ?? "").trim();
  if (!name) throw new Error("name é obrigatório");
  const { data, error } = await supabase
    .from("stock_categories")
    .insert({ name, updated_at: new Date().toISOString() })
    .select("id, name")
    .single();
  if (error) throw new Error(`Criar categoria: ${error.message}`);
  return rowToCategory(data as Row);
}

export async function updateStockCategory(
  id: string,
  body: StockCategoryUpdateBody
): Promise<StockCategory> {
  const supabase = requireSupabase();
  const name = (body.name ?? "").trim();
  if (!name) throw new Error("name é obrigatório");
  const { data, error } = await supabase
    .from("stock_categories")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name")
    .single();
  if (error) throw new Error(`Atualizar categoria: ${error.message}`);
  if (!data) throw new Error("Categoria não encontrada");
  return rowToCategory(data as Row);
}

export async function deleteStockCategory(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from("stock_categories").delete().eq("id", id);
  if (error) throw new Error(`Eliminar categoria: ${error.message}`);
}
