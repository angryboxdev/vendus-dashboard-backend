import type { VendusProductCatalogPort } from "../../domain/ports/out/vendus-product-catalog.port.js";
import type { VendusProduct, RawVendusProduct } from "../../domain/entities/vendus-product.js";
import { detectCategoryFromId, detectCategoryFromTitle } from "../../domain/services/category-detector.service.js";
import { vendusGet } from "../../../../infra/vendusClient.js";

const PRODUCTS_PER_PAGE = 100;
const TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Carrega o catálogo de produtos da API Vendus (/products/) e mantém-o
 * em cache em memória (TTL 10 min).
 *
 * Map keys:
 *  - reference normalizado (lowercase trim) para produtos com reference
 *  - "title:" + title normalizado como chave secundária para lookup por título
 */
export class VendusProductCatalogAdapter implements VendusProductCatalogPort {
  private cache: Map<string, VendusProduct> | null = null;
  private loadedAt = 0;

  constructor(
    private readonly salaoPriceGroupId: number,
    private readonly eatzPriceGroupId: number,
  ) {}

  async getProducts(): Promise<Map<string, VendusProduct>> {
    if (this.cache && Date.now() - this.loadedAt < TTL_MS) {
      return this.cache;
    }
    const raw = await this.fetchAll();
    this.cache = this.buildMap(raw);
    this.loadedAt = Date.now();
    return this.cache;
  }

  private async fetchAll(): Promise<RawVendusProduct[]> {
    const all: RawVendusProduct[] = [];
    let page = 1;

    while (true) {
      let payload: unknown;
      try {
        payload = await vendusGet(`/products/`, { per_page: PRODUCTS_PER_PAGE, page, status: "on" });
      } catch {
        break;
      }

      const items = extractItems(payload) as RawVendusProduct[];
      all.push(...items);
      if (items.length < PRODUCTS_PER_PAGE) break;
      page++;
      if (page > 50) break; // fail-safe
    }

    return all;
  }

  private buildMap(products: RawVendusProduct[]): Map<string, VendusProduct> {
    const map = new Map<string, VendusProduct>();

    for (const raw of products) {
      const prices = Array.isArray(raw.prices) ? raw.prices : [];
      const salaoEntry = prices.find((p) => Number(p.id) === this.salaoPriceGroupId);
      const eatzEntry = prices.find((p) => Number(p.id) === this.eatzPriceGroupId);

      const category =
        detectCategoryFromId(raw.category_id) ??
        detectCategoryFromTitle(raw.title);

      const product: VendusProduct = {
        id: raw.id,
        reference: raw.reference ?? "",
        title: raw.title,
        category_id: raw.category_id,
        category,
        salaoPrice: salaoEntry ? parseFloat(salaoEntry.price) : null,
        eatzPrice: eatzEntry ? parseFloat(eatzEntry.price) : null,
      };

      const normRef = (raw.reference ?? "").trim().toLowerCase();
      if (normRef) map.set(normRef, product);

      // Always index by title for fallback lookups
      const normTitle = `title:${raw.title.trim().toLowerCase()}`;
      if (!map.has(normTitle)) map.set(normTitle, product);
    }

    return map;
  }
}

function extractItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (Array.isArray(p["data"])) return p["data"] as unknown[];
  }
  return [];
}
