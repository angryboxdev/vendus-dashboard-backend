import type { RecipeCostingSnapshot } from "../entities/recipe-costing.js";
import { computeRecipeCosting, expandLine } from "./recipe-cost.service.js";

/** Uma ficha técnica (pizza × tamanho) que usa o ingrediente, com o peso no custo atual (V6 §7). */
export interface IngredientUsage {
  pizzaId: string;
  name: string;
  isActive: boolean;
  size: string;
  /** Quantidade do ingrediente por pizza, na unidade base, com perdas e preparos já aplicados. */
  quantity: number;
  /** Custo dessa quantidade (€ s/ IVA, custo atual da ficha); null sem preço. */
  costWithoutVat: number | null;
  /** Custo total da pizza nesse tamanho. */
  dishCostWithoutVat: number;
  /** Parte do custo da pizza (0–1); null sem preço. */
  share: number | null;
  /** Entra diretamente ou através de um preparo (nome do preparo). */
  via: string | null;
}

/**
 * Pizzas com receita ativa que usam o ingrediente — diretamente ou dentro de um preparo (sem contar
 * duas vezes) —, com a quantidade e o custo pela mesma regra do custo das fichas técnicas.
 */
export function ingredientUsage(snapshot: RecipeCostingSnapshot, stockItemId: string): IngredientUsage[] {
  const preparations = new Map(snapshot.preparations.map((p) => [p.id, p]));
  const cost = snapshot.ingredients.find((c) => c.stockItemId === stockItemId);
  const unit = cost?.unitCostWithoutVat != null && cost.unitCostWithoutVat > 0 ? cost.unitCostWithoutVat : null;
  const report = computeRecipeCosting(snapshot);
  const out: IngredientUsage[] = [];
  for (const dish of snapshot.dishes) {
    for (const line of dish.lines ?? []) {
      const uses = expandLine(line, preparations).filter((u) => u.stockItemId === stockItemId);
      if (uses.length === 0) continue;
      const quantity = uses.reduce((s, u) => s + u.quantity, 0);
      const via = line.preparationId ? preparations.get(line.preparationId)?.name ?? null : null;
      const existing = out.find((u) => u.pizzaId === dish.pizzaId && u.size === line.size && u.via === via);
      const dishCost = report.dishes.find((d) => d.pizzaId === dish.pizzaId)?.sizes.find((s) => s.size === line.size)?.costWithoutVat ?? 0;
      if (existing) {
        existing.quantity += quantity;
        existing.costWithoutVat = unit === null ? null : existing.quantity * unit;
        existing.share = unit === null || dishCost <= 0 ? null : existing.costWithoutVat! / dishCost;
        continue;
      }
      const c = unit === null ? null : quantity * unit;
      out.push({ pizzaId: dish.pizzaId, name: dish.name, isActive: dish.isActive, size: line.size, quantity, costWithoutVat: c, dishCostWithoutVat: dishCost, share: c === null || dishCost <= 0 ? null : c / dishCost, via });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "pt") || a.size.localeCompare(b.size));
}
