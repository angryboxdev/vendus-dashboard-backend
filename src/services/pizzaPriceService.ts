import { getSupabase, isSupabaseConfigured } from "../infra/supabaseClient.js";
import type { PizzaPrice, PizzaPriceCreateBody, PizzaPriceUpdateBody, PizzaSize } from "../domain/pizzaTypes.js";

type Row = {
  id: string;
  pizza_id: string;
  size: string;
  price: number;
  created_at?: string;
  updated_at?: string;
};

function rowToPrice(row: Row): PizzaPrice {
  const p: PizzaPrice = {
    id: row.id,
    pizza_id: row.pizza_id,
    size: row.size as PizzaSize,
    price: Number(row.price),
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

const SIZES: PizzaSize[] = ["small", "large"];
export function validatePizzaSize(s: string): s is PizzaSize {
  return SIZES.includes(s as PizzaSize);
}

export async function listPizzaPrices(pizzaId: string): Promise<PizzaPrice[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("pizza_prices")
    .select("id, pizza_id, size, price, created_at, updated_at")
    .eq("pizza_id", pizzaId)
    .order("size", { ascending: true });
  if (error) throw new Error(`Pizza prices: ${error.message}`);
  return ((data ?? []) as Row[]).map(rowToPrice);
}

export async function getPizzaPrice(id: string): Promise<PizzaPrice | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("pizza_prices")
    .select("id, pizza_id, size, price, created_at, updated_at")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return rowToPrice(data as Row);
}

export async function createPizzaPrice(body: PizzaPriceCreateBody): Promise<PizzaPrice> {
  const supabase = requireSupabase();
  if (!body.pizza_id) throw new Error("pizza_id é obrigatório");
  if (!validatePizzaSize(body.size)) throw new Error(`size inválido: ${body.size}`);
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0) throw new Error("price inválido");
  const payload = {
    pizza_id: body.pizza_id,
    size: body.size,
    price,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("pizza_prices")
    .insert(payload)
    .select("id, pizza_id, size, price, created_at, updated_at")
    .single();
  if (error) throw new Error(`Criar preço: ${error.message}`);
  return rowToPrice(data as Row);
}

export async function updatePizzaPrice(id: string, body: PizzaPriceUpdateBody): Promise<PizzaPrice> {
  const supabase = requireSupabase();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) throw new Error("price inválido");
    updates.price = price;
  }
  const { data, error } = await supabase
    .from("pizza_prices")
    .update(updates)
    .eq("id", id)
    .select("id, pizza_id, size, price, created_at, updated_at")
    .single();
  if (error) throw new Error(`Atualizar preço: ${error.message}`);
  if (!data) throw new Error("Preço não encontrado");
  return rowToPrice(data as Row);
}

export async function deletePizzaPrice(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from("pizza_prices").delete().eq("id", id);
  if (error) throw new Error(`Eliminar preço: ${error.message}`);
}
