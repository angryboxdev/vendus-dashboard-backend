import type { Category } from "./types.js";
import { getCategoryFromCatalog } from "./priceMap.js";
import { normalize } from "../utils/normalize.js";

/**
 * Categoria:
 * 1) se o produto estiver no catálogo Vendus, usa o mapeamento de category_id
 * 2) fallback por heurística do title
 */
export function detectCategoryFromMapOrTitle(item: any): Category {
  const fromCatalog = getCategoryFromCatalog(item);
  if (fromCatalog) return fromCatalog;

  const t = normalize(item?.title || "");

  if (t.includes("(individual)") || t.includes("(grande)")) return "pizza";
  if (
    t.includes("taxa de saco") ||
    t.includes("saco") ||
    t.includes("embalagem")
  )
    return "sacos";

  const alc = [
    "san miguel",
    "maestra",
    "sangria",
    "cerveja",
    "beer",
    "vinho",
    "wine",
  ];
  if (alc.some((k) => t.includes(k))) return "bebida_alcoolica";

  const nonAlc = [
    "coca",
    "cola",
    "ice tea",
    "lipton",
    "guaran",
    "água",
    "agua",
    "solan",
    "seven up",
    "sumo",
  ];
  if (nonAlc.some((k) => t.includes(k))) return "bebida_nao_alcoolica";

  return "outros";
}
