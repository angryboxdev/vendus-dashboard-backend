import { getSupabase, isSupabaseConfigured } from "../infra/supabaseClient.js";

import { ENV } from "../config/env.js";
import type { StockItemType } from "../domain/stockTypes.js";
import { buildMonthlySummary } from "./monthlySummaryService.js";
import { fetchAllDocuments } from "./documentsService.js";
import { extractProductLinesFromSelfConsumptionRecords } from "./selfconsumptionService.js";
import { computeConsumptionForProductLinesLenient } from "./stockAdjustmentFromLinesService.js";
import type { VendusSelfConsumptionSummary } from "../domain/types.js";
import { getAllConsumptionMappingsMap } from "./vendusMappingService.js";
import { listPizzaRecipeItems } from "./pizzaRecipeItemService.js";
import { listPizzaRecipes } from "./pizzaRecipeService.js";
import { getPreparationWithItems } from "./preparationService.js";
import { DateTime } from "luxon";
import {
  lisbonDayEndUtcIso,
  lisbonDayStartUtcIso,
  REPORT_TIMEZONE,
} from "../utils/lisbonDayInstants.js";

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

/** Saldo à meia-noite em Lisboa do primeiro dia do período (antes de qualquer movimento nesse dia civil). */
export type StockOpeningEntry = {
  stock_item_id: string;
  name: string;
  base_unit: string;
  type: StockItemType;
  category_id: string;
  category_name: string;
  quantity_at_period_start: number;
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
  /** Consumo estimado a partir de vendas (FS), receitas e mapeamentos. */
  consumption: IngredientConsumptionEntry[];
  /**
   * Consumo estimado a partir de autoconsumo Vendus (GET /selfconsumption/), mesmas regras de mapeamento.
   * Separado de `consumption` para não misturar com vendas (pode ser `[]`).
   */
  consumption_selfconsumption: IngredientConsumptionEntry[];
  additions: StockAdditionEntry[];
  /** Saldo no início do dia civil `since` em Lisboa (movimentos com movement_date < meia-noite Lisboa em `since`); só itens em consumption ∪ additions ∪ consumption_selfconsumption. */
  opening_stock: StockOpeningEntry[];
  matched_products?: MatchedProductEntry[];
  /** Payload bruto + metadados do autoconsumo no período (quando disponível; alinhado com monthly-summary). */
  vendus_selfconsumption?: VendusSelfConsumptionSummary;
  debug?: {
    products_total: number;
    products_matched: number;
    products_unmatched: number;
    unmatched_products: UnmatchedProductEntry[];
    took_ms: number;
    selfconsumption_lines_extracted?: number;
    selfconsumption_mapping_skipped?: string[];
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

  const sinceTs = lisbonDayStartUtcIso(since);
  const untilTs = lisbonDayEndUtcIso(until);

  const { data: movements, error: movError } = await supabase
    .from("stock_movements")
    .select("item_id, quantity")
    .gt("quantity", 0)
    .gte("movement_date", sinceTs)
    .lte("movement_date", untilTs)
    .limit(100000);

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

type StockRowWithCategory = {
  id: string;
  name: string;
  base_unit: string;
  type: string;
  category_id: string;
  stock_categories: { name: string } | { name: string }[] | null;
};

function categoryNameFromRow(
  r: StockRowWithCategory
): { category_name: string } & StockRowWithCategory {
  const category_name = Array.isArray(r.stock_categories)
    ? r.stock_categories[0]?.name ?? ""
    : r.stock_categories?.name ?? "";
  return { ...r, category_name };
}

/** Soma de quantity por item com movement_date estritamente antes da meia-noite Lisboa do dia `since`. */
async function getOpeningStockAtPeriodStart(
  since: string,
  itemIds: string[]
): Promise<StockOpeningEntry[]> {
  const entries: StockOpeningEntry[] = [];
  if (!itemIds.length || !isSupabaseConfigured()) return entries;
  const supabase = getSupabase();
  if (!supabase) return entries;

  const sinceTs = lisbonDayStartUtcIso(since);

  const { data: movements, error: movError } = await supabase
    .from("stock_movements")
    .select("item_id, quantity")
    .in("item_id", itemIds)
    .lt("movement_date", sinceTs)
    .limit(100000);

  if (movError) return entries;

  const byItemId = new Map<string, number>();
  for (const id of itemIds) byItemId.set(id, 0);
  for (const m of (movements ?? []) as Array<{ item_id: string; quantity: number }>) {
    const qty = byItemId.get(m.item_id) ?? 0;
    byItemId.set(m.item_id, qty + Number(m.quantity));
  }

  const { data: rows, error: itemsError } = await supabase
    .from("stock_items")
    .select("id, name, base_unit, type, category_id, stock_categories(name)")
    .in("id", itemIds);

  if (itemsError || !rows?.length) return entries;

  const byId = new Map(
    (rows as StockRowWithCategory[]).map((r) => {
      const x = categoryNameFromRow(r);
      return [r.id, x] as const;
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
      quantity_at_period_start:
        Math.round((byItemId.get(id) ?? 0) * 1000) / 1000,
    });
  }

  entries.sort((a, b) =>
    a.name.localeCompare(b.name, "pt", { sensitivity: "base" })
  );
  return entries;
}

type StockItemRowWithCategory = {
  id: string;
  name: string;
  base_unit: string;
  type: string;
  category_id: string;
  category_name: string;
};

/** Constrói entradas de consumo a partir de quantidades por stock_item_id (reutilizado vendas vs autoconsumo). */
async function buildConsumptionEntriesFromStockMap(
  consumptionByStockId: Map<string, number>
): Promise<{
  entries: IngredientConsumptionEntry[];
  byId: Map<string, StockItemRowWithCategory>;
}> {
  const entries: IngredientConsumptionEntry[] = [];
  const byId = new Map<string, StockItemRowWithCategory>();
  const stockIds = Array.from(consumptionByStockId.keys());
  if (stockIds.length === 0 || !isSupabaseConfigured()) {
    return { entries, byId };
  }
  const supabase = getSupabase();
  if (!supabase) return { entries, byId };

  const { data: rows, error } = await supabase
    .from("stock_items")
    .select("id, name, base_unit, type, category_id, stock_categories(name)")
    .in("id", stockIds);
  if (error || !rows?.length) return { entries, byId };

  for (const r of rows as Array<{
    id: string;
    name: string;
    base_unit: string;
    type: string;
    category_id: string;
    stock_categories: { name: string } | { name: string }[] | null;
  }>) {
    const categoryName = Array.isArray(r.stock_categories)
      ? r.stock_categories[0]?.name ?? ""
      : r.stock_categories?.name ?? "";
    byId.set(r.id, {
      ...r,
      category_name: categoryName,
    });
  }

  for (const id of stockIds) {
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
      quantity_consumed:
        Math.round((consumptionByStockId.get(id) ?? 0) * 1000) / 1000,
    });
  }
  entries.sort((a, b) => b.quantity_consumed - a.quantity_consumed);
  return { entries, byId };
}

/** Retorna since/until para "ontem" (YYYY-MM-DD) no calendário de Lisboa (independente do TZ do servidor). */
export function getDefaultPeriod(): { since: string; until: string } {
  const yesterday = DateTime.now()
    .setZone(REPORT_TIMEZONE)
    .minus({ days: 1 });
  const day = yesterday.toISODate();
  if (!day) {
    throw new Error("Não foi possível calcular o período por omissão");
  }
  return { since: day, until: day };
}

export type GetIngredientConsumptionOptions = {
  /** Filtra autoconsumo Vendus por loja (GET /selfconsumption/?store_id=). */
  vendus_store_id?: number;
};

export async function getIngredientConsumption(
  since: string,
  until: string,
  options?: GetIngredientConsumptionOptions
): Promise<IngredientConsumptionResponse> {
  const startedAt = Date.now();

  const response = await buildMonthlySummary({
    since,
    until,
    type: "FS,NC",
    perPage: ENV.PER_PAGE_DEFAULT,
    concurrency: ENV.CONCURRENCY,
    fetchAllDocuments,
    ...(options?.vendus_store_id != null
      ? { vendus_selfconsumption_store_id: options.vendus_store_id }
      : {}),
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
        if (item.stock_item_id) {
          // Ingrediente direto
          const qty =
            (consumptionByStockId.get(item.stock_item_id) ?? 0) +
            item.quantity * product.qty;
          consumptionByStockId.set(item.stock_item_id, qty);
        } else if (item.preparation_id) {
          const preparation = await getPreparationWithItems(item.preparation_id);
          if (!preparation) continue;
          const factor = preparation.use_as_unit
            ? item.quantity
            : preparation.yield_qty > 0
              ? item.quantity / preparation.yield_qty
              : 0;
          if (factor === 0) continue;
          for (const pi of preparation.items) {
            const qty =
              (consumptionByStockId.get(pi.stock_item_id) ?? 0) +
              pi.quantity * factor * product.qty;
            consumptionByStockId.set(pi.stock_item_id, qty);
          }
        }
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

  const { entries: consumptionEntries, byId } =
    await buildConsumptionEntriesFromStockMap(consumptionByStockId);
  for (const m of matchedProducts) {
    if (m.match_type === "stock" && m.stock_item_id) {
      const row = byId.get(m.stock_item_id);
      m.stock_item_name = row?.name ?? m.stock_item_id;
    }
  }

  const vsc = response.vendus_selfconsumption;
  const selfLines = extractProductLinesFromSelfConsumptionRecords(
    vsc?.records ?? []
  );
  const { map: selfConsumptionMap, skipped: selfconsumption_skipped } =
    await computeConsumptionForProductLinesLenient(selfLines);
  const { entries: consumption_selfconsumption } =
    await buildConsumptionEntriesFromStockMap(selfConsumptionMap);

  const additionsEntries = await getStockAdditionsForPeriod(since, until);

  const openingItemIds = new Set<string>();
  for (const c of consumptionEntries) openingItemIds.add(c.stock_item_id);
  for (const c of consumption_selfconsumption) openingItemIds.add(c.stock_item_id);
  for (const a of additionsEntries) openingItemIds.add(a.stock_item_id);
  const openingEntries = await getOpeningStockAtPeriodStart(
    since,
    Array.from(openingItemIds)
  );

  const tookMs = Date.now() - startedAt;

  return {
    period: {
      since: response.period?.since ?? since,
      until: response.period?.until ?? until,
      timezone: REPORT_TIMEZONE,
    },
    consumption: consumptionEntries,
    consumption_selfconsumption,
    additions: additionsEntries,
    opening_stock: openingEntries,
    matched_products: matchedProducts,
    ...(vsc !== undefined ? { vendus_selfconsumption: vsc } : {}),
    debug: {
      products_total: products.length,
      products_matched: products.length - unmatchedProducts.length,
      products_unmatched: unmatchedProducts.length,
      unmatched_products: unmatchedProducts,
      took_ms: tookMs,
      selfconsumption_lines_extracted: selfLines.length,
      ...(selfconsumption_skipped.length > 0
        ? { selfconsumption_mapping_skipped: selfconsumption_skipped }
        : {}),
    },
  };
}
