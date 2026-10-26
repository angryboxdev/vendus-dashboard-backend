import type { PreparationDefinition, RecipeLine } from "./recipe-costing.js";
import type { WeeklyPricePoint } from "./price-history.js";

/**
 * Custo teórico semanal de uma pizza (task V5 §6): versão da ficha técnica em vigor em cada semana ×
 * preço semanal de cada ingrediente. É CMV teórico (o que a ficha diz), não consumo real; nunca mexe
 * no Stock.
 */

/** Versão gravada de uma ficha (pizza): as linhas da receita ativa a partir de `effectiveFrom`. */
export interface RecipeVersion {
  effectiveFrom: string;
  lines: RecipeLine[];
}

export interface PreparationVersion {
  effectiveFrom: string;
  definition: PreparationDefinition;
}

export interface IngredientInfo {
  name: string;
  baseUnit: string;
  /** Custo de referência manual do artigo (cêntimos por unidade base) — usado só sem nenhuma compra. */
  manualCentsPerUnit: number | null;
  /** Série semanal do preço de compra (as mesmas semanas do cálculo). */
  weeks: WeeklyPricePoint[];
}

/** De onde vem o preço da semana: compra nessa semana, último preço transportado, manual, ou nenhum. */
export type WeeklyPriceSource = "purchase" | "carried" | "manual" | "none";

export interface WeeklyLineCost {
  stockItemId: string | null;
  preparationId: string | null;
  name: string;
  quantity: number;
  baseUnit: string | null;
  /** € s/ IVA da linha (parcial quando `complete = false`). */
  costWithoutVat: number;
  /** A pior origem entre os ingredientes da linha (um preparo junta vários). */
  source: WeeklyPriceSource;
  complete: boolean;
}

export interface WeeklyDishCostPoint {
  week: string;
  weekStart: string;
  partial: boolean;
  /** «no_version» = semana anterior à primeira versão gravada da ficha. */
  status: "ok" | "incomplete" | "no_version";
  /** Início da versão da ficha usada nesta semana. */
  versionFrom: string | null;
  /** € s/ IVA por pizza; null sem versão. Parcial quando `status = incomplete`. */
  costWithoutVat: number | null;
  /** Variação face à semana anterior comparável (ambas completas); null sem comparação. */
  changeRatio: number | null;
  lines: WeeklyLineCost[];
}

export interface WeeklyDishCost {
  pizzaId: string;
  name: string;
  /** Data/hora da primeira versão gravada (antes disso não há histórico da ficha). */
  firstVersionAt: string | null;
  sizes: { size: string; weeks: WeeklyDishCostPoint[] }[];
}
