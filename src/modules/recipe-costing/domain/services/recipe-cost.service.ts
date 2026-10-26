import type {
  DishCosting,
  DishLineCost,
  DishSizeCost,
  IngredientCost,
  MissingPriceIngredient,
  PreparationDefinition,
  RecipeCostingReport,
  RecipeCostingSnapshot,
  RecipeLine,
} from "../entities/recipe-costing.js";

const SIZE_ORDER = ["small", "large"];

function roundCost(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function hasPrice(cost: IngredientCost | undefined): cost is IngredientCost & { unitCostWithoutVat: number } {
  return cost != null && cost.unitCostWithoutVat != null && cost.unitCostWithoutVat > 0;
}

/**
 * Fator de um preparo numa linha de receita — mesma regra do consumo de stock
 * (`ingredientConsumptionService`): `useAsUnit` → a quantidade são execuções
 * completas; senão é uma parte do rendimento (`quantity / yieldQty`).
 */
export function preparationFactor(preparation: PreparationDefinition, quantity: number): number {
  if (preparation.useAsUnit) return quantity;
  return preparation.yieldQty > 0 ? quantity / preparation.yieldQty : 0;
}

/** Artigos de stock (com quantidade por unidade de linha) que uma linha de receita consome. */
export function expandLine(
  line: RecipeLine,
  preparations: Map<string, PreparationDefinition>,
): { stockItemId: string; quantity: number }[] {
  const waste = 1 + (line.wasteFactor ?? 0);
  if (line.stockItemId) return [{ stockItemId: line.stockItemId, quantity: line.quantity * waste }];
  if (!line.preparationId) return [];
  const preparation = preparations.get(line.preparationId);
  if (!preparation) return [];
  const factor = preparationFactor(preparation, line.quantity);
  return preparation.items.map((pi) => ({ stockItemId: pi.stockItemId, quantity: pi.quantity * factor * waste }));
}

function sortSizes(sizes: Iterable<string>): string[] {
  const rank = (s: string) => {
    const i = SIZE_ORDER.indexOf(s);
    return i === -1 ? SIZE_ORDER.length : i;
  };
  return [...new Set(sizes)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * Custo das fichas técnicas a partir do custo atual de cada ingrediente
 * (s/ IVA, por unidade base). Um ingrediente sem preço não bloqueia o cálculo:
 * o tamanho fica `complete = false` e o ingrediente entra em `missingPrices`.
 */
export function computeRecipeCosting(snapshot: RecipeCostingSnapshot): RecipeCostingReport {
  const preparations = new Map(snapshot.preparations.map((p) => [p.id, p]));
  const costs = new Map(snapshot.ingredients.map((c) => [c.stockItemId, c]));
  const usedIngredientIds = new Set<string>();
  const missing = new Map<string, MissingPriceIngredient>();

  const dishes: DishCosting[] = snapshot.dishes.map((dish) => {
    const lines = dish.lines ?? [];
    const sizes = sortSizes([...dish.prices.map((p) => p.size), ...lines.map((l) => l.size)]);

    const sizeCosts: DishSizeCost[] = sizes.map((size) => {
      let total = 0;
      const missingIds = new Set<string>();
      const lineCosts: DishLineCost[] = [];
      for (const line of lines.filter((l) => l.size === size)) {
        let lineTotal = 0;
        let lineComplete = true;
        const uses = expandLine(line, preparations);
        if (uses.length === 0) lineComplete = false;
        for (const use of uses) {
          usedIngredientIds.add(use.stockItemId);
          const cost = costs.get(use.stockItemId);
          if (!hasPrice(cost)) {
            missingIds.add(use.stockItemId);
            const entry = missing.get(use.stockItemId) ?? {
              stockItemId: use.stockItemId,
              name: cost?.name ?? "",
              baseUnit: cost?.baseUnit ?? "",
              usedIn: [],
            };
            if (!entry.usedIn.some((d) => d.pizzaId === dish.pizzaId)) {
              entry.usedIn.push({ pizzaId: dish.pizzaId, name: dish.name });
            }
            missing.set(use.stockItemId, entry);
            lineComplete = false;
            continue;
          }
          lineTotal += use.quantity * cost.unitCostWithoutVat;
        }
        total += lineTotal;
        const item = line.stockItemId ? costs.get(line.stockItemId) : undefined;
        lineCosts.push({
          stockItemId: line.stockItemId,
          preparationId: line.stockItemId ? null : line.preparationId,
          name: line.stockItemId ? (item?.name ?? "") : (preparations.get(line.preparationId ?? "")?.name ?? ""),
          quantity: line.quantity,
          baseUnit: line.stockItemId ? (item?.baseUnit ?? null) : null,
          wasteFactor: line.wasteFactor,
          unitCostWithoutVat: line.stockItemId && hasPrice(item) ? item.unitCostWithoutVat : null,
          costWithoutVat: roundCost(lineTotal),
          complete: lineComplete,
        });
      }
      const price = dish.prices.find((p) => p.size === size);
      return {
        size,
        costWithoutVat: roundCost(total),
        salePrice: price ? price.price : null,
        complete: missingIds.size === 0,
        missingStockItemIds: [...missingIds],
        lines: lineCosts,
      };
    });

    return {
      pizzaId: dish.pizzaId,
      name: dish.name,
      category: dish.category,
      isActive: dish.isActive,
      hasActiveRecipe: dish.lines !== null,
      sizes: sizeCosts,
    };
  });

  const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "pt");
  return {
    dishes,
    ingredients: snapshot.ingredients.filter((c) => usedIngredientIds.has(c.stockItemId)).sort(byName),
    missingPrices: [...missing.values()].sort(byName),
  };
}
