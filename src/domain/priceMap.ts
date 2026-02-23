import type { PriceMap, PriceMapProduct } from "./types.js";

import fs from "node:fs";
import { normalize } from "../utils/normalize.js";
import path from "node:path";

/** Lê o price-map.json 1x ao subir o server */
const PRICE_MAP_PATH = path.join(process.cwd(), "price-map.json");
export const priceMap: PriceMap = JSON.parse(
  fs.readFileSync(PRICE_MAP_PATH, "utf-8")
);

/** Busca por reference primeiro, depois por title */
export function findInPriceMap(item: any): PriceMapProduct | null {
  const reference = normalize(item?.reference || "");
  const title = normalize(item?.title || "");

  if (reference) {
    const byRef = priceMap.products.find(
      (p) =>
        p.match.by === "reference" && normalize(p.match.value) === reference
    );
    if (byRef) return byRef;
  }

  if (title) {
    const byTitle = priceMap.products.find(
      (p) => p.match.by === "title" && normalize(p.match.value) === title
    );
    if (byTitle) return byTitle;
  }

  return null;
}

export function asPriceList(v: number | number[] | null | undefined): number[] {
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
