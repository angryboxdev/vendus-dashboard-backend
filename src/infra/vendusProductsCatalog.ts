import fs from "node:fs";
import path from "node:path";
import { normalize } from "../utils/normalize.js";
import { vendusGet } from "./vendusClient.js";

// ─── Config (read once) ──────────────────────────────────────────────────────

const _config = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "price-map.json"), "utf-8")
) as { price_group_ids: { restaurant: number; delivery: number } };

const REST_GROUP_ID = _config.price_group_ids.restaurant;
const DELIV_GROUP_ID = _config.price_group_ids.delivery;

// ─── Types ───────────────────────────────────────────────────────────────────

type VendusApiProductPrice = { id: number; price: string };

type VendusApiProduct = {
  reference: string;
  title: string;
  category_id: number;
  prices: VendusApiProductPrice[];
};

export type CatalogEntry = {
  reference: string;
  title: string;
  category_id: number;
  restaurantPrice: number | null;
  deliveryPrice: number | null;
};

type Catalog = {
  byReference: Map<string, CatalogEntry>;
  byNormalizedTitle: Map<string, CatalogEntry>;
  loadedAt: number;
  size: number;
};

// ─── Cache ───────────────────────────────────────────────────────────────────

const TTL_MS = 10 * 60 * 1000; // 10 minutes
let catalog: Catalog | null = null;

export async function loadProductCatalog(): Promise<void> {
  if (catalog && Date.now() - catalog.loadedAt < TTL_MS) return;

  const products = await vendusGet<VendusApiProduct[]>("/products/");

  const byReference = new Map<string, CatalogEntry>();
  const byNormalizedTitle = new Map<string, CatalogEntry>();

  for (const p of products) {
    const restEntry = p.prices.find((pg) => pg.id === REST_GROUP_ID);
    const delivEntry = p.prices.find((pg) => pg.id === DELIV_GROUP_ID);

    const entry: CatalogEntry = {
      reference: p.reference,
      title: p.title,
      category_id: p.category_id,
      restaurantPrice: restEntry ? parseFloat(restEntry.price) : null,
      deliveryPrice: delivEntry ? parseFloat(delivEntry.price) : null,
    };

    const normRef = normalize(p.reference || "");
    if (normRef) byReference.set(normRef, entry);
    byNormalizedTitle.set(normalize(p.title), entry);
  }

  catalog = {
    byReference,
    byNormalizedTitle,
    loadedAt: Date.now(),
    size: products.length,
  };
}

export function getCatalogEntry(item: {
  reference?: string;
  title?: string;
}): CatalogEntry | null {
  if (!catalog) return null;

  const normRef = normalize(item?.reference || "");
  if (normRef) {
    const e = catalog.byReference.get(normRef);
    if (e) return e;
  }

  const normTitle = normalize(item?.title || "");
  if (normTitle) return catalog.byNormalizedTitle.get(normTitle) ?? null;

  return null;
}

export function getCatalogSize(): number {
  return catalog?.size ?? 0;
}
