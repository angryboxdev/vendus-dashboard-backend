import type { VendusProduct } from "../../entities/vendus-product.js";

/**
 * Catálogo de produtos Vendus com cache.
 *
 * Implementado por VendusProductCatalogAdapter (adapters/out).
 * O domínio depende desta interface — nunca do adapter concreto.
 *
 * Devolve um Map keyed por `reference` normalizado (lowercase trim).
 * Produtos sem reference são também indexados por `title` normalizado
 * para fallback de lookup.
 */
export interface VendusProductCatalogPort {
  /**
   * Devolve o catálogo completo.
   * O adapter mantém cache em memória com TTL configurável.
   *
   * Map key: reference normalizado. Para produtos sem reference,
   * a chave é `title:` + title normalizado.
   */
  getProducts(): Promise<Map<string, VendusProduct>>;
}
