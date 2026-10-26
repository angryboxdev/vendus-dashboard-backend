import type { PurchaseObservation } from "../../domain/entities/price-history.js";
import type { IngredientCost, RecipeCostingSnapshot } from "../../domain/entities/recipe-costing.js";
import type { IngredientInfo } from "../../domain/entities/weekly-dish-cost.js";
import { ingredientCostOverview } from "../../domain/services/ingredient-overview.service.js";
import { ingredientUsage } from "../../domain/services/ingredient-usage.service.js";
import { dishImpact } from "../../domain/services/dish-impact.service.js";
import { weeklyPriceHistory, weeksUntil } from "../../domain/services/price-history.service.js";

const obs = (date: string, quantity: number, netCents: number, supplier = "Fornecedor Exemplo"): PurchaseObservation => ({
  lineId: `${date}-${quantity}-${netCents}`, supplierId: "sup-1", supplierName: supplier, invoiceNumber: "FT 1", invoiceDate: date, quantity, grossCents: null, discountCents: null, netCents,
});

describe("resumo de custos por ingrediente (V6 §6)", () => {
  test("último custo confirmado, referência = média ponderada das 12 semanas anteriores, variação", () => {
    const o = ingredientCostOverview("mozz", [
      obs("2026-09-01", 10000, 5000), // 5,00 €/kg
      obs("2026-09-20", 5000, 3500), // 7,00 €/kg
      obs("2026-10-20", 20000, 11160), // 5,58 €/kg (última)
    ], "2026-10-26");
    expect(o.lastPurchase).toMatchObject({ invoiceDate: "2026-10-20", centsPerUnit: 0.558, supplierId: "sup-1" });
    expect(o.reference!.centsPerUnit * 1000).toBeCloseTo(566.667, 2); // (50 + 35) / 15 kg
    expect(o.reference!.purchases).toBe(2);
    expect(o.changeRatio!).toBeCloseTo(0.558 / 0.566667 - 1, 4);
    expect(o.weekly).toHaveLength(12);
  });

  test("uma só compra → sem referência («histórico insuficiente»), nunca 0%", () => {
    const o = ingredientCostOverview("x", [obs("2026-10-20", 1000, 779)], "2026-10-26");
    expect([o.reference, o.changeRatio]).toEqual([null, null]);
  });

  test("custo abaixo de 0,005 €/g mantém a precisão (não vira zero)", () => {
    const o = ingredientCostOverview("tomate", [obs("2026-10-05", 20000, 3845)], "2026-10-26");
    expect(o.lastPurchase!.centsPerUnit).toBeCloseTo(0.19225, 6); // 0,0019225 €/g
  });
});

const cost = (stockItemId: string, name: string, unitCostWithoutVat: number | null): IngredientCost => ({ stockItemId, name, baseUnit: "g", unitCostWithoutVat, source: unitCostWithoutVat ? "invoice" : null });

describe("fichas que usam o ingrediente (V6 §7)", () => {
  test("direto e dentro de um preparo, sem contar duas vezes; parte no custo da pizza", () => {
    const snapshot: RecipeCostingSnapshot = {
      ingredients: [cost("mozz", "Mozzarella", 0.0082), cost("ch", "Cheddar", 0.00779)],
      preparations: [{ id: "mix", name: "Mix de Queijos", yieldQty: 2800, useAsUnit: false, items: [{ stockItemId: "mozz", quantity: 2500 }, { stockItemId: "ch", quantity: 300 }] }],
      dishes: [
        { pizzaId: "marg", name: "Margherita", category: "classics", isActive: true, prices: [], lines: [{ stockItemId: "mozz", preparationId: null, size: "small", quantity: 100, wasteFactor: null }] },
        { pizzaId: "4q", name: "Quatro Queijos", category: "classics", isActive: true, prices: [], lines: [{ stockItemId: null, preparationId: "mix", size: "small", quantity: 280, wasteFactor: null }] },
        { pizzaId: "veg", name: "Vegetariana", category: "classics", isActive: true, prices: [], lines: [{ stockItemId: "ch", preparationId: null, size: "small", quantity: 50, wasteFactor: null }] },
      ],
    };
    const u = ingredientUsage(snapshot, "mozz");
    expect(u.map((x) => [x.name, x.size, x.quantity, x.via])).toEqual([["Margherita", "small", 100, null], ["Quatro Queijos", "small", 250, "Mix de Queijos"]]);
    // V6: 100 g de mozzarella a 8,20 €/kg = 0,82 €; é todo o custo da Margherita.
    expect(u[0]!.costWithoutVat).toBeCloseTo(0.82, 6);
    expect(u[0]!.share).toBeCloseTo(1, 6);
  });
});

describe("impacto do preço dos ingredientes nas pizzas (V6 §8)", () => {
  const TODAY = "2026-10-26"; // W44
  const weeks = weeksUntil(TODAY, 5); // W40..W44
  const info = (name: string, observations: PurchaseObservation[], manual: number | null = null): IngredientInfo => ({ name, baseUnit: "g", manualCentsPerUnit: manual, weeks: weeklyPriceHistory(observations, TODAY, 5) });

  test("mesma ficha, preços de agora vs há 4 semanas: variação, contribuição por ingrediente que reconcilia, fator principal", () => {
    const ingredients = new Map([
      ["mozz", info("Mozzarella", [obs("2026-09-28", 10000, 7500), obs("2026-10-20", 10000, 8200)])], // 7,50 → 8,20 €/kg
      ["tom", info("Tomate", [obs("2026-09-28", 20000, 3845), obs("2026-10-21", 20000, 4000)])], // 1,9225 → 2,00 €/kg
    ]);
    const [small] = dishImpact({
      lines: [{ stockItemId: "mozz", preparationId: null, size: "small", quantity: 100, wasteFactor: null }, { stockItemId: "tom", preparationId: null, size: "small", quantity: 80, wasteFactor: null }],
      preparations: [], ingredients, weeks, nowIndex: 4, thenIndex: 0,
    });
    expect(small!.now).toMatchObject({ week: "2026-W44", costWithoutVat: 0.98 }); // 0,82 + 0,16
    expect(small!.then.week).toBe("2026-W40");
    expect(small!.lines.map((l) => [l.name, l.nowCost, l.thenCost, l.diff])).toEqual([["Mozzarella", 0.82, 0.75, 0.07], ["Tomate", 0.16, 0.1538, 0.0062]]);
    const sum = small!.lines.reduce((s, l) => s + l.diff, 0);
    expect(Math.abs(sum - small!.change!)).toBeLessThan(0.0002); // reconcilia (arredondamento a 4 casas por linha)
    expect(small!.mainFactor).toEqual({ name: "Mozzarella", diff: 0.07 });
    expect(small!.comparable).toBe(true);
  });

  test("ingrediente sem preço numa das semanas → não comparável (sem variação nem fator)", () => {
    const ingredients = new Map([["novo", info("Novo", [obs("2026-10-20", 1000, 500)])]]);
    const [small] = dishImpact({ lines: [{ stockItemId: "novo", preparationId: null, size: "small", quantity: 10, wasteFactor: null }], preparations: [], ingredients, weeks, nowIndex: 4, thenIndex: 0 });
    expect([small!.comparable, small!.change, small!.changeRatio, small!.mainFactor]).toEqual([false, null, null, null]);
  });
});
