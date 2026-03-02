import { getSupabase, isSupabaseConfigured } from "../infra/supabaseClient.js";
import type { PizzaSize } from "../domain/pizzaTypes.js";

export type VendusMappingRow = {
  target_type: "pizza" | "stock";
  pizza_id: string | null;
  pizza_size: PizzaSize | null;
  stock_item_id: string | null;
};

export type PizzaMappingEntry = { pizza_id: string; pizza_size: PizzaSize };

function requireSupabase(): NonNullable<ReturnType<typeof getSupabase>> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase não configurado: defina SUPABASE_URL e SUPABASE_ANON_KEY");
  }
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase não disponível");
  return supabase;
}

/** Obtém um mapeamento por match_by + match_value */
export async function getVendusMapping(
  matchBy: "reference" | "title",
  matchValue: string
): Promise<VendusMappingRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("vendus_product_mapping")
    .select("target_type, pizza_id, pizza_size, stock_item_id")
    .eq("match_by", matchBy)
    .eq("match_value", matchValue)
    .maybeSingle();
  if (error) throw new Error(`Vendus mapping: ${error.message}`);
  if (!data) return null;
  const row = data as {
    target_type: string;
    pizza_id: string | null;
    pizza_size: string | null;
    stock_item_id: string | null;
  };
  return {
    target_type: row.target_type as VendusMappingRow["target_type"],
    pizza_id: row.pizza_id ?? null,
    pizza_size: row.pizza_size as PizzaSize | null,
    stock_item_id: row.stock_item_id ?? null,
  };
}

/** Map key: "reference:VAL" ou "title:VAL". Value: pizza_id + pizza_size (só entradas tipo pizza). */
export async function getPizzaMappingsMap(): Promise<
  Map<string, PizzaMappingEntry>
> {
  const map = new Map<string, PizzaMappingEntry>();
  if (!isSupabaseConfigured()) return map;
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("vendus_product_mapping")
    .select("match_by, match_value, pizza_id, pizza_size")
    .eq("target_type", "pizza")
    .not("pizza_id", "is", null)
    .not("pizza_size", "is", null);
  if (error) throw new Error(`Vendus mapping: ${error.message}`);
  const rows = (data ?? []) as Array<{
    match_by: string;
    match_value: string;
    pizza_id: string;
    pizza_size: string;
  }>;
  for (const r of rows) {
    const key = `${r.match_by}:${r.match_value}`;
    map.set(key, {
      pizza_id: r.pizza_id,
      pizza_size: r.pizza_size as PizzaSize,
    });
  }
  return map;
}

export type ConsumptionMappingEntry =
  | { type: "pizza"; pizza_id: string; pizza_size: PizzaSize }
  | { type: "stock"; stock_item_id: string };

/** Map key: "reference:VAL" ou "title:VAL". Inclui pizza e stock (para consumo completo). */
export async function getAllConsumptionMappingsMap(): Promise<
  Map<string, ConsumptionMappingEntry>
> {
  const map = new Map<string, ConsumptionMappingEntry>();
  if (!isSupabaseConfigured()) return map;
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("vendus_product_mapping")
    .select("match_by, match_value, target_type, pizza_id, pizza_size, stock_item_id");
  if (error) throw new Error(`Vendus mapping: ${error.message}`);
  const rows = (data ?? []) as Array<{
    match_by: string;
    match_value: string;
    target_type: string;
    pizza_id: string | null;
    pizza_size: string | null;
    stock_item_id: string | null;
  }>;
  for (const r of rows) {
    const key = `${r.match_by}:${r.match_value}`;
    if (r.target_type === "pizza" && r.pizza_id && r.pizza_size) {
      map.set(key, { type: "pizza", pizza_id: r.pizza_id, pizza_size: r.pizza_size as PizzaSize });
    } else if (r.target_type === "stock" && r.stock_item_id) {
      map.set(key, { type: "stock", stock_item_id: r.stock_item_id });
    }
  }
  return map;
}
