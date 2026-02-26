import { getSupabase, isSupabaseConfigured } from "../infra/supabaseClient.js";
import type { Pizza, PizzaCreateBody, PizzaUpdateBody, PizzaCategory } from "../domain/pizzaTypes.js";

type Row = {
  id: string;
  name: string;
  description: string;
  category: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

function rowToPizza(row: Row): Pizza {
  const p: Pizza = {
    id: row.id,
    name: row.name ?? "",
    description: row.description ?? "",
    category: row.category as PizzaCategory,
    is_active: Boolean(row.is_active),
  };
  if (row.created_at !== undefined) p.created_at = row.created_at;
  if (row.updated_at !== undefined) p.updated_at = row.updated_at;
  return p;
}

function requireSupabase(): NonNullable<ReturnType<typeof getSupabase>> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase não configurado: defina SUPABASE_URL e SUPABASE_ANON_KEY");
  }
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase não disponível");
  return supabase;
}

const CATEGORIES: PizzaCategory[] = ["classics", "specials", "sweeties"];
export function validatePizzaCategory(c: string): c is PizzaCategory {
  return CATEGORIES.includes(c as PizzaCategory);
}

export async function listPizzas(filters?: { category?: PizzaCategory; is_active?: boolean }): Promise<Pizza[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  if (!supabase) return [];
  let q = supabase.from("pizzas").select("id, name, description, category, is_active, created_at, updated_at").order("name", { ascending: true });
  if (filters?.category) q = q.eq("category", filters.category);
  if (filters?.is_active !== undefined) q = q.eq("is_active", filters.is_active);
  const { data, error } = await q;
  if (error) throw new Error(`Pizzas: ${error.message}`);
  return ((data ?? []) as Row[]).map(rowToPizza);
}

export async function getPizza(id: string): Promise<Pizza | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("pizzas")
    .select("id, name, description, category, is_active, created_at, updated_at")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return rowToPizza(data as Row);
}

export async function createPizza(body: PizzaCreateBody): Promise<Pizza> {
  const supabase = requireSupabase();
  const name = (body.name ?? "").trim();
  if (!name) throw new Error("name é obrigatório");
  if (!validatePizzaCategory(body.category)) throw new Error(`category inválida: ${body.category}`);
  const payload = {
    name,
    description: (body.description ?? "").trim(),
    category: body.category,
    is_active: body.is_active !== false,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("pizzas")
    .insert(payload)
    .select("id, name, description, category, is_active, created_at, updated_at")
    .single();
  if (error) throw new Error(`Criar pizza: ${error.message}`);
  return rowToPizza(data as Row);
}

export async function updatePizza(id: string, body: PizzaUpdateBody): Promise<Pizza> {
  const supabase = requireSupabase();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = (body.name ?? "").trim();
  if (body.description !== undefined) updates.description = (body.description ?? "").trim();
  if (body.category !== undefined) {
    if (!validatePizzaCategory(body.category)) throw new Error(`category inválida: ${body.category}`);
    updates.category = body.category;
  }
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  const { data, error } = await supabase
    .from("pizzas")
    .update(updates)
    .eq("id", id)
    .select("id, name, description, category, is_active, created_at, updated_at")
    .single();
  if (error) throw new Error(`Atualizar pizza: ${error.message}`);
  if (!data) throw new Error("Pizza não encontrada");
  return rowToPizza(data as Row);
}

export async function deletePizza(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from("pizzas").delete().eq("id", id);
  if (error) throw new Error(`Eliminar pizza: ${error.message}`);
}
