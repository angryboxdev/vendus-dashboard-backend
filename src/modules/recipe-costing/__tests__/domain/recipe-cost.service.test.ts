import { computeRecipeCosting, preparationFactor } from "../../domain/services/recipe-cost.service.js";
import type { DishDefinition, IngredientCost, RecipeCostingSnapshot } from "../../domain/entities/recipe-costing.js";

const farinha: IngredientCost = { stockItemId: "farinha", name: "Farinha", baseUnit: "g", unitCostWithoutVat: 0.001, source: "invoice" };
const queijo: IngredientCost = { stockItemId: "queijo", name: "Queijo", baseUnit: "g", unitCostWithoutVat: 0.01, source: "manual" };
const tomate: IngredientCost = { stockItemId: "tomate", name: "Tomate", baseUnit: "g", unitCostWithoutVat: null, source: null };

function dish(partial: Partial<DishDefinition>): DishDefinition {
  return { pizzaId: "p1", name: "Margherita", category: "classics", isActive: true, prices: [], lines: [], ...partial };
}

function snapshot(partial: Partial<RecipeCostingSnapshot>): RecipeCostingSnapshot {
  return { dishes: [], preparations: [], ingredients: [farinha, queijo, tomate], ...partial };
}

describe("computeRecipeCosting", () => {
  it("soma quantidade × custo por tamanho e junta o PVP", () => {
    const report = computeRecipeCosting(snapshot({
      dishes: [dish({
        prices: [{ size: "large", price: 12 }, { size: "small", price: 8 }],
        lines: [
          { stockItemId: "farinha", preparationId: null, size: "small", quantity: 200, wasteFactor: null },
          { stockItemId: "queijo", preparationId: null, size: "small", quantity: 100, wasteFactor: null },
          { stockItemId: "farinha", preparationId: null, size: "large", quantity: 300, wasteFactor: null },
        ],
      })],
    }));
    const [small, large] = report.dishes[0]!.sizes;
    expect(small).toMatchObject({ size: "small", costWithoutVat: 1.2, salePrice: 8, complete: true, missingStockItemIds: [] });
    expect(large).toMatchObject({ size: "large", costWithoutVat: 0.3, salePrice: 12, complete: true });
  });

  it("aplica a percentagem de perda da linha", () => {
    const report = computeRecipeCosting(snapshot({
      dishes: [dish({ lines: [{ stockItemId: "queijo", preparationId: null, size: "small", quantity: 100, wasteFactor: 0.1 }] })],
    }));
    expect(report.dishes[0]!.sizes[0]!.costWithoutVat).toBe(1.1);
  });

  it("custeia preparos pela mesma regra do consumo (parte do rendimento ou unidades)", () => {
    const molho = { id: "molho", name: "Molho", yieldQty: 500, useAsUnit: false, items: [{ stockItemId: "queijo", quantity: 250 }] };
    const massa = { id: "massa", name: "Massa", yieldQty: 1, useAsUnit: true, items: [{ stockItemId: "farinha", quantity: 1000 }] };
    expect(preparationFactor(molho, 100)).toBe(0.2);
    expect(preparationFactor(massa, 2)).toBe(2);

    const report = computeRecipeCosting(snapshot({
      preparations: [molho, massa],
      dishes: [dish({ lines: [
        { stockItemId: null, preparationId: "molho", size: "small", quantity: 100, wasteFactor: null },
        { stockItemId: null, preparationId: "massa", size: "small", quantity: 1, wasteFactor: null },
      ] })],
    }));
    // molho: 0.2 × 250 g × 0.01 = 0.5 · massa: 1 × 1000 g × 0.001 = 1
    expect(report.dishes[0]!.sizes[0]!.costWithoutVat).toBe(1.5);
  });

  it("ingrediente sem preço não bloqueia: custo parcial, tamanho incompleto e alerta com os pratos", () => {
    const report = computeRecipeCosting(snapshot({
      preparations: [{ id: "molho", name: "Molho", yieldQty: 100, useAsUnit: false, items: [{ stockItemId: "tomate", quantity: 100 }] }],
      dishes: [
        dish({ lines: [
          { stockItemId: "farinha", preparationId: null, size: "small", quantity: 100, wasteFactor: null },
          { stockItemId: "tomate", preparationId: null, size: "small", quantity: 50, wasteFactor: null },
        ] }),
        dish({ pizzaId: "p2", name: "Bianca", lines: [
          { stockItemId: null, preparationId: "molho", size: "large", quantity: 50, wasteFactor: null },
        ] }),
      ],
    }));
    expect(report.dishes[0]!.sizes[0]).toMatchObject({ costWithoutVat: 0.1, complete: false, missingStockItemIds: ["tomate"] });
    expect(report.missingPrices).toEqual([{
      stockItemId: "tomate", name: "Tomate", baseUnit: "g",
      usedIn: [{ pizzaId: "p1", name: "Margherita" }, { pizzaId: "p2", name: "Bianca" }],
    }]);
  });

  it("preço 0 conta como sem preço", () => {
    const report = computeRecipeCosting(snapshot({
      ingredients: [{ ...farinha, unitCostWithoutVat: 0, source: "manual" }],
      dishes: [dish({ lines: [{ stockItemId: "farinha", preparationId: null, size: "small", quantity: 100, wasteFactor: null }] })],
    }));
    expect(report.dishes[0]!.sizes[0]!.complete).toBe(false);
    expect(report.missingPrices.map((m) => m.stockItemId)).toEqual(["farinha"]);
  });

  it("prato sem receita ativa: sem custo, mas mostra os tamanhos com PVP", () => {
    const report = computeRecipeCosting(snapshot({ dishes: [dish({ lines: null, prices: [{ size: "small", price: 8 }] })] }));
    expect(report.dishes[0]).toMatchObject({ hasActiveRecipe: false, sizes: [{ size: "small", costWithoutVat: 0, salePrice: 8, complete: true }] });
  });

  it("lista só os ingredientes usados, com a origem do custo", () => {
    const report = computeRecipeCosting(snapshot({
      dishes: [dish({ lines: [{ stockItemId: "queijo", preparationId: null, size: "small", quantity: 1, wasteFactor: null }] })],
    }));
    expect(report.ingredients).toEqual([queijo]);
  });

  it("discrimina o custo de cada linha da ficha (artigo e preparo), com perda e preço unitário", () => {
    const molho = { id: "molho", name: "Molho", yieldQty: 100, useAsUnit: false, items: [{ stockItemId: "queijo", quantity: 50 }, { stockItemId: "tomate", quantity: 50 }] };
    const report = computeRecipeCosting(snapshot({
      preparations: [molho],
      dishes: [dish({ lines: [
        { stockItemId: "queijo", preparationId: null, size: "small", quantity: 100, wasteFactor: 0.1 },
        { stockItemId: null, preparationId: "molho", size: "small", quantity: 100, wasteFactor: null },
      ] })],
    }));
    const size = report.dishes[0]!.sizes[0]!;
    expect(size.lines).toEqual([
      { stockItemId: "queijo", preparationId: null, name: "Queijo", quantity: 100, baseUnit: "g", wasteFactor: 0.1, unitCostWithoutVat: 0.01, costWithoutVat: 1.1, complete: true },
      // Preparo com um ingrediente sem preço: custo parcial (só o queijo) e linha incompleta.
      { stockItemId: null, preparationId: "molho", name: "Molho", quantity: 100, baseUnit: null, wasteFactor: null, unitCostWithoutVat: null, costWithoutVat: 0.5, complete: false },
    ]);
    expect(size.costWithoutVat).toBe(1.6);
  });
});
