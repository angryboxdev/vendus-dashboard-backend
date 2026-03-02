import { getSupabase, isSupabaseConfigured } from "../infra/supabaseClient.js";

import { ENV } from "../config/env.js";
import type { StockItemType } from "../domain/stockTypes.js";
import { buildMonthlySummary } from "./monthlySummaryService.js";
import { fetchAllDocuments } from "./documentsService.js";
import { getAllConsumptionMappingsMap } from "./vendusMappingService.js";
import { listPizzaRecipeItems } from "./pizzaRecipeItemService.js";
import { listPizzaRecipes } from "./pizzaRecipeService.js";

export type IngredientConsumptionEntry = {
  stock_item_id: string;
  name: string;
  base_unit: string;
  type: StockItemType;
  category_id: string;
  category_name: string;
  quantity_consumed: number;
};

export type StockAdditionEntry = {
  stock_item_id: string;
  name: string;
  base_unit: string;
  type: StockItemType;
  category_id: string;
  category_name: string;
  quantity_added: number;
};

export type MatchedProductEntry = {
  title: string;
  reference: string;
  category: string; // Vendus: pizza | bebida_alcoolica | bebida_nao_alcoolica | sacos | outros
  qty_sold: number;
  match_type: "pizza" | "stock";
  pizza_id?: string;
  size?: "small" | "large";
  stock_item_id?: string;
  stock_item_name?: string;
};

export type UnmatchedProductEntry = {
  title: string;
  reference: string;
  category: string;
  qty: number;
};

export type IngredientConsumptionResponse = {
  period: { since: string; until: string; timezone?: string };
  consumption: IngredientConsumptionEntry[];
  additions: StockAdditionEntry[];
  matched_products?: MatchedProductEntry[];
  debug?: {
    products_total: number;
    products_matched: number;
    products_unmatched: number;
    unmatched_products: UnmatchedProductEntry[];
    took_ms: number;
  };
};

/** Adições de stock no período (movimentos com quantity > 0, agregados por item). */
async function getStockAdditionsForPeriod(
  since: string,
  until: string
): Promise<StockAdditionEntry[]> {
  const entries: StockAdditionEntry[] = [];
  if (!isSupabaseConfigured()) return entries;
  const supabase = getSupabase();
  if (!supabase) return entries;

  const sinceTs = `${since}T00:00:00.000Z`;
  const untilTs = `${until}T23:59:59.999Z`;

  const { data: movements, error: movError } = await supabase
    .from("stock_movements")
    .select("item_id, quantity")
    .gt("quantity", 0)
    .gte("movement_date", sinceTs)
    .lte("movement_date", untilTs);

  if (movError || !movements?.length) return entries;

  const byItemId = new Map<string, number>();
  for (const m of movements as Array<{ item_id: string; quantity: number }>) {
    const qty = byItemId.get(m.item_id) ?? 0;
    byItemId.set(m.item_id, qty + Number(m.quantity));
  }

  const itemIds = Array.from(byItemId.keys());
  const { data: rows, error: itemsError } = await supabase
    .from("stock_items")
    .select("id, name, base_unit, type, category_id, stock_categories(name)")
    .in("id", itemIds);

  if (itemsError || !rows?.length) return entries;

  const byId = new Map(
    (
      rows as Array<{
        id: string;
        name: string;
        base_unit: string;
        type: string;
        category_id: string;
        stock_categories: { name: string } | { name: string }[] | null;
      }>
    ).map((r) => {
      const categoryName = Array.isArray(r.stock_categories)
        ? r.stock_categories[0]?.name ?? ""
        : r.stock_categories?.name ?? "";
      return [r.id, { ...r, category_name: categoryName }] as const;
    })
  );

  for (const id of itemIds) {
    const row = byId.get(id);
    const name = row?.name ?? id;
    const base_unit = row?.base_unit ?? "g";
    const type = (row?.type ?? "other") as StockItemType;
    const category_id = row?.category_id ?? "";
    const category_name = row?.category_name ?? "";
    entries.push({
      stock_item_id: id,
      name,
      base_unit,
      type,
      category_id,
      category_name,
      quantity_added: Math.round((byItemId.get(id) ?? 0) * 1000) / 1000,
    });
  }

  entries.sort((a, b) => b.quantity_added - a.quantity_added);
  return entries;
}

/** Retorna since/until para "ontem" (YYYY-MM-DD) em Portugal. */
export function getDefaultPeriod(): { since: string; until: string } {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const y = yesterday.getFullYear();
  const m = String(yesterday.getMonth() + 1).padStart(2, "0");
  const d = String(yesterday.getDate()).padStart(2, "0");
  const day = `${y}-${m}-${d}`;
  return { since: day, until: day };
}

export async function getIngredientConsumption(
  since: string,
  until: string
): Promise<IngredientConsumptionResponse> {
  const startedAt = Date.now();

  const response = await buildMonthlySummary({
    since,
    until,
    type: "FS,NC",
    perPage: ENV.PER_PAGE_DEFAULT,
    concurrency: ENV.CONCURRENCY,
    fetchAllDocuments,
  });

  const products = response.products_overall ?? [];
  const mappings = await getAllConsumptionMappingsMap();

  const consumptionByStockId = new Map<string, number>();
  const matchedProducts: MatchedProductEntry[] = [];
  const unmatchedProducts: UnmatchedProductEntry[] = [];

  for (const product of products) {
    const mappingByRef =
      product.reference != null && product.reference !== ""
        ? mappings.get(`reference:${product.reference}`)
        : undefined;
    const mappingByTitle = mappings.get(`title:${product.title}`);

    const mapping = mappingByRef ?? mappingByTitle;
    if (!mapping) {
      unmatchedProducts.push({
        title: product.title,
        reference: product.reference,
        category: product.category ?? "outros",
        qty: product.qty,
      });
      continue;
    }

    if (mapping.type === "pizza") {
      const recipes = await listPizzaRecipes(mapping.pizza_id);
      const activeRecipe = recipes.find((r) => r.is_active);
      if (!activeRecipe) continue;

      const items = await listPizzaRecipeItems(activeRecipe.id);
      const itemsForSize = items.filter((i) => i.size === mapping.pizza_size);

      for (const item of itemsForSize) {
        const qty =
          (consumptionByStockId.get(item.stock_item_id) ?? 0) +
          item.quantity * product.qty;
        consumptionByStockId.set(item.stock_item_id, qty);
      }

      matchedProducts.push({
        title: product.title,
        reference: product.reference,
        category: product.category ?? "pizza",
        qty_sold: product.qty,
        match_type: "pizza",
        pizza_id: mapping.pizza_id,
        size: mapping.pizza_size,
      });
    } else {
      const qty =
        (consumptionByStockId.get(mapping.stock_item_id) ?? 0) + product.qty;
      consumptionByStockId.set(mapping.stock_item_id, qty);
      matchedProducts.push({
        title: product.title,
        reference: product.reference,
        category: product.category ?? "outros",
        qty_sold: product.qty,
        match_type: "stock",
        stock_item_id: mapping.stock_item_id,
      });
    }
  }

  const stockIds = Array.from(consumptionByStockId.keys());
  const consumptionEntries: IngredientConsumptionEntry[] = [];

  if (stockIds.length > 0 && isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (supabase) {
      const { data: rows, error } = await supabase
        .from("stock_items")
        .select(
          "id, name, base_unit, type, category_id, stock_categories(name)"
        )
        .in("id", stockIds);
      if (!error && rows?.length) {
        const byId = new Map(
          (
            rows as Array<{
              id: string;
              name: string;
              base_unit: string;
              type: string;
              category_id: string;
              stock_categories: { name: string } | { name: string }[] | null;
            }>
          ).map((r) => {
            const categoryName = Array.isArray(r.stock_categories)
              ? r.stock_categories[0]?.name ?? ""
              : r.stock_categories?.name ?? "";
            return [
              r.id,
              {
                ...r,
                category_name: categoryName,
              },
            ] as const;
          })
        );
        for (const id of stockIds) {
          const row = byId.get(id);
          const name = row?.name ?? id;
          const base_unit = row?.base_unit ?? "g";
          const type = (row?.type ?? "other") as StockItemType;
          const category_id = row?.category_id ?? "";
          const category_name = row?.category_name ?? "";
          consumptionEntries.push({
            stock_item_id: id,
            name,
            base_unit,
            type,
            category_id,
            category_name,
            quantity_consumed:
              Math.round(consumptionByStockId.get(id)! * 1000) / 1000,
          });
        }
        for (const m of matchedProducts) {
          if (m.match_type === "stock" && m.stock_item_id) {
            const row = byId.get(m.stock_item_id);
            m.stock_item_name = row?.name ?? m.stock_item_id;
          }
        }
      }
    }
  }

  consumptionEntries.sort((a, b) => b.quantity_consumed - a.quantity_consumed);

  const additionsEntries = await getStockAdditionsForPeriod(since, until);

  const tookMs = Date.now() - startedAt;

  return {
    period: {
      since: response.period?.since ?? since,
      until: response.period?.until ?? until,
      timezone: "Europe/Lisbon",
    },
    consumption: consumptionEntries,
    additions: additionsEntries,
    matched_products: matchedProducts,
    debug: {
      products_total: products.length,
      products_matched: products.length - unmatchedProducts.length,
      products_unmatched: unmatchedProducts.length,
      unmatched_products: unmatchedProducts,
      took_ms: tookMs,
    },
  };
}
