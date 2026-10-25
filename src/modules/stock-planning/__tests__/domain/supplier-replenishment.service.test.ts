import { buildReplenishmentRows, type ReplenishmentInput } from "../../domain/services/supplier-replenishment.service.js";

function input(over: Partial<ReplenishmentInput>): ReplenishmentInput {
  return {
    stockItemId: "x", name: "Artigo", categoryName: null, baseUnit: "un", currentQuantity: 0, minStockQty: 0,
    consumption30d: 0, recommendation: null, lastPurchase: null, ...over,
  };
}

describe("buildReplenishmentRows", () => {
  it("usa a recomendação da previsão quando sugere comprar", () => {
    const [row] = buildReplenishmentRows([
      input({ currentQuantity: 30, minStockQty: 24, recommendation: { suggestedBaseQty: 24, suggestedPurchaseQty: 1, purchaseUnit: "Pack 24" } }),
    ]);
    expect(row).toMatchObject({ suggestedBaseQty: 24, suggestedPurchaseQty: 1, purchaseUnit: "Pack 24", suggestionSource: "forecast", needsReplenishment: true });
  });

  it("sem previsão, repõe só até ao stock mínimo", () => {
    const [row] = buildReplenishmentRows([input({ currentQuantity: 6, minStockQty: 24 })]);
    expect(row).toMatchObject({ suggestedBaseQty: 18, suggestedPurchaseQty: null, suggestionSource: "min_stock", needsReplenishment: true });
  });

  it("acima do mínimo e sem previsão não há necessidade", () => {
    const [row] = buildReplenishmentRows([input({ currentQuantity: 30, minStockQty: 24 })]);
    expect(row).toMatchObject({ suggestedBaseQty: 0, suggestionSource: null, needsReplenishment: false });
  });

  it("unidade de compra vem da última fatura quando a previsão não a tem; código também", () => {
    const [row] = buildReplenishmentRows([
      input({ lastPurchase: { date: "2026-09-12", unitCostWithoutVat: 0.89, supplierItemCode: "AG001", purchaseUnit: "Pack 6" } }),
    ]);
    expect(row).toMatchObject({ code: "AG001", purchaseUnit: "Pack 6", lastPurchaseDate: "2026-09-12", lastUnitPrice: 0.89 });
  });

  it("artigos com necessidade aparecem primeiro, depois por nome", () => {
    const rows = buildReplenishmentRows([
      input({ stockItemId: "a", name: "Água", currentQuantity: 50, minStockQty: 10 }),
      input({ stockItemId: "z", name: "Zimbro", currentQuantity: 1, minStockQty: 10 }),
      input({ stockItemId: "b", name: "Batata", currentQuantity: 50, minStockQty: 10 }),
    ]);
    expect(rows.map((r) => r.stockItemId)).toEqual(["z", "a", "b"]);
  });
});
