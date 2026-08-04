// ─── Category ────────────────────────────────────────────────────────────────

/**
 * Categorias de produto do negócio.
 * Mapeadas a partir do `category_id` da API Vendus via VENDUS_CATEGORY_MAP.
 */
export type VendusCategory =
  | "pizza"
  | "bebida_alcoolica"
  | "bebida_nao_alcoolica"
  | "sacos"
  | "outros";

// ─── Category map ─────────────────────────────────────────────────────────────

/**
 * Mapeamento de category_id Vendus → categoria interna.
 *
 * Estes IDs são estáveis por instalação — correspondem às categorias
 * configuradas no Vendus para este negócio. Se o Vendus criar novas categorias,
 * adicionar aqui e em `src/modules/vendus/domain/services/category-detector.service.ts`.
 */
export const VENDUS_CATEGORY_MAP: Record<string, VendusCategory> = {
  "278665754": "pizza",
  "278665355": "pizza",
  "278665776": "pizza",
  "278665677": "pizza",
  "277326048": "bebida_nao_alcoolica",
  "278667084": "bebida_alcoolica",
  "278665808": "bebida_alcoolica",
  "275975456": "sacos",
  "290966863": "outros",
  "290972068": "outros",
};

// ─── Product ──────────────────────────────────────────────────────────────────

/** Produto do catálogo Vendus, enriquecido com categoria e preços por canal. */
export interface VendusProduct {
  id: number;
  reference: string;
  title: string;
  category_id: number;
  category: VendusCategory;
  /** Preço de salão (price group salaoPriceGroupId). null se não configurado. */
  salaoPrice: number | null;
  /** Preço de eatz/delivery (price group eatzPriceGroupId). null se não configurado. */
  eatzPrice: number | null;
}

/** Shape raw de um produto como devolvido pela API Vendus /products/. */
export interface RawVendusProduct {
  id: number;
  reference: string;
  title: string;
  category_id: number;
  prices: Array<{ id: number; price: string }>;
}
