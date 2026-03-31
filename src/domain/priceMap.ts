import type { Category } from "./types.js";
import { getCatalogEntry } from "../infra/vendusProductsCatalog.js";
import { normalize } from "../utils/normalize.js";
import fs from "node:fs";
import path from "node:path";

// ─── Config ──────────────────────────────────────────────────────────────────

type LegacyPriceEntry = {
  match: { by: "reference" | "title"; value: string };
  prices: { restaurant?: number | null; delivery?: number | null };
};

type PriceMapConfig = {
  version: number;
  tolerance: number;
  price_group_ids: { restaurant: number; delivery: number };
  vendus_category_map: Record<string, Category>;
  legacy_prices: LegacyPriceEntry[];
};

const PRICE_MAP_PATH = path.join(process.cwd(), "price-map.json");
export const priceMapConfig: PriceMapConfig = JSON.parse(
  fs.readFileSync(PRICE_MAP_PATH, "utf-8")
);

// ─── Legacy lookup ───────────────────────────────────────────────────────────

function findLegacyEntry(item: {
  reference?: string;
  title?: string;
}): LegacyPriceEntry | null {
  const normRef = normalize(item?.reference || "");
  const normTitle = normalize(item?.title || "");

  for (const entry of priceMapConfig.legacy_prices) {
    const val = normalize(entry.match.value);
    if (entry.match.by === "reference" && normRef && val === normRef)
      return entry;
    if (entry.match.by === "title" && normTitle && val === normTitle)
      return entry;
  }
  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns all valid prices (current from API + legacy) for channel detection.
 * Returns null if the product is completely unknown (not in catalog or legacy).
 */
export function findProductInfo(item: {
  reference?: string;
  title?: string;
}): { restaurantPrices: number[]; deliveryPrices: number[] } | null {
  const catalogEntry = getCatalogEntry(item);
  const legacyEntry = findLegacyEntry(item);

  if (!catalogEntry && !legacyEntry) return null;

  const restaurantPrices: number[] = [];
  const deliveryPrices: number[] = [];

  if (catalogEntry) {
    if (catalogEntry.restaurantPrice != null)
      restaurantPrices.push(catalogEntry.restaurantPrice);
    if (catalogEntry.deliveryPrice != null)
      deliveryPrices.push(catalogEntry.deliveryPrice);
  }

  if (legacyEntry) {
    const lr = legacyEntry.prices.restaurant;
    const ld = legacyEntry.prices.delivery;
    if (lr != null && !restaurantPrices.includes(lr)) restaurantPrices.push(lr);
    if (ld != null && !deliveryPrices.includes(ld)) deliveryPrices.push(ld);
  }

  if (restaurantPrices.length === 0 && deliveryPrices.length === 0) return null;
  return { restaurantPrices, deliveryPrices };
}

/**
 * Returns the internal Category for a product by looking up
 * the Vendus category_id in vendus_category_map.
 * Returns null if the product is not in the catalog.
 */
export function getCategoryFromCatalog(item: {
  reference?: string;
  title?: string;
}): Category | null {
  const entry = getCatalogEntry(item);
  if (!entry) return null;
  return (
    priceMapConfig.vendus_category_map[String(entry.category_id)] ?? null
  );
}

// ─── Helpers (shared with channelDetection) ──────────────────────────────────

export function asPriceList(
  v: number | number[] | null | undefined
): number[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Se gross_unit não vier, tenta inferir por gross_total / qty */
export function getUnitGross(item: any): number {
  const qty = Number(item?.qty || 0) || 0;
  const grossUnit = Number(
    String(item?.amounts?.gross_unit || "0").replace(",", ".")
  );
  if (grossUnit > 0) return grossUnit;

  const grossTotal = Number(
    String(item?.amounts?.gross_total || "0").replace(",", ".")
  );
  if (qty > 0 && grossTotal > 0) return grossTotal / qty;

  return 0;
}
