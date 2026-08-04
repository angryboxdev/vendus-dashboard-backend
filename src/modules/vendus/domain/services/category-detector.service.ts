import type { VendusCategory } from "../entities/vendus-product.js";
import { VENDUS_CATEGORY_MAP } from "../entities/vendus-product.js";

/**
 * Devolve a categoria interna a partir do category_id Vendus.
 * null se o ID não estiver no mapa.
 */
export function detectCategoryFromId(categoryId: number): VendusCategory | null {
  return VENDUS_CATEGORY_MAP[String(categoryId)] ?? null;
}

/**
 * Fallback de categoria por heurística do título do item.
 * Usado quando o produto não está no catálogo.
 */
export function detectCategoryFromTitle(title: string): VendusCategory {
  const t = title.toLowerCase();
  if (t.includes("(individual)") || t.includes("(grande)")) return "pizza";
  if (t.includes("embalagem") || t.includes("taxa de saco") || t.includes("saco")) return "sacos";
  const alc = ["san miguel", "maestra", "sangria", "cerveja", "beer", "vinho", "wine"];
  if (alc.some((k) => t.includes(k))) return "bebida_alcoolica";
  const nonAlc = ["coca", "cola", "ice tea", "lipton", "guarana", "água", "agua", "solan", "seven up", "sumo"];
  if (nonAlc.some((k) => t.includes(k))) return "bebida_nao_alcoolica";
  return "outros";
}

/**
 * Determina a categoria de um item a partir do produto do catálogo
 * (por reference ou title) com fallback por título.
 */
export function detectCategory(
  item: { reference?: string; title: string },
  catalog: Map<string, import("../entities/vendus-product.js").VendusProduct>,
): VendusCategory {
  const normRef = (item.reference ?? "").trim().toLowerCase();
  if (normRef) {
    const p = catalog.get(normRef);
    if (p) return p.category;
  }
  const normTitle = `title:${item.title.trim().toLowerCase()}`;
  const byTitle = catalog.get(normTitle);
  if (byTitle) return byTitle.category;
  return detectCategoryFromTitle(item.title);
}
