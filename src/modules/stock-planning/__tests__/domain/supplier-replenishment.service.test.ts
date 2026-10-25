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

describe("buildReplenishmentRows — embalagem de compra (task embalagens/conversões P2)", () => {
  const saco = { packageUnit: "saco", contentQuantity: 2.5, contentUnit: "kg" as const, invoicedBy: "content" as const, minOrderPackages: 1, orderIncrementPackages: 1 };

  it("preciso de 12 kg → encomendar 5 sacos (12,5 kg), excedente 0,5 kg", () => {
    const [row] = buildReplenishmentRows([input({ baseUnit: "kg", currentQuantity: 3, minStockQty: 15, presentation: saco })]);
    expect(row).toMatchObject({
      suggestedBaseQty: 12, suggestedPurchaseQty: 5, purchaseUnit: "saco", presentationConfigured: true,
      order: { packageUnit: "saco", packages: 5, contentQuantity: 2.5, contentUnit: "kg", quantityBase: 12.5, surplusBase: 0.5 },
    });
  });

  it("artigo em g, previsão de 500 g → 1 saco (nunca meio saco)", () => {
    const [row] = buildReplenishmentRows([input({ baseUnit: "g", recommendation: { suggestedBaseQty: 500, suggestedPurchaseQty: null, purchaseUnit: null }, presentation: saco })]);
    expect(row).toMatchObject({ suggestedPurchaseQty: 1, order: { packages: 1, quantityBase: 2500, surplusBase: 2000 } });
  });

  it("sem necessidade → 0 sacos; sem embalagem confirmada → por configurar (sem encomenda em embalagens)", () => {
    const [none] = buildReplenishmentRows([input({ baseUnit: "kg", currentQuantity: 30, minStockQty: 10, presentation: saco })]);
    expect(none).toMatchObject({ order: { packages: 0 }, needsReplenishment: false });
    const [missing] = buildReplenishmentRows([input({ baseUnit: "kg", currentQuantity: 3, minStockQty: 15 })]);
    expect(missing).toMatchObject({ order: null, presentationConfigured: false, suggestedBaseQty: 12 });
  });
});
