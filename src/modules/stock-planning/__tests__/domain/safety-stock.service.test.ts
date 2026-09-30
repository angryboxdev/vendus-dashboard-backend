import { computeSafetyStock } from "../../domain/services/safety-stock.service.js";

describe("computeSafetyStock", () => {
  it("valor configurado é sempre respeitado, nunca sobreposto", () => {
    const result = computeSafetyStock({
      recentDailyConsumption: [10, 12, 9, 11, 10, 13, 8, 10, 11],
      leadTimeDays: 2,
      configuredSafetyStockQty: 5,
      minStockQty: 20,
    });
    expect(result).toEqual({ suggestedQty: 5, basis: "configured" });
  });

  it("sem histórico suficiente, cai para o piso min_stock", () => {
    const result = computeSafetyStock({
      recentDailyConsumption: [10, 12],
      leadTimeDays: 2,
      configuredSafetyStockQty: null,
      minStockQty: 15,
    });
    expect(result).toEqual({ suggestedQty: 15, basis: "min_stock_floor" });
  });

  it("com histórico suficiente e sem valor configurado, calcula dinamicamente", () => {
    const result = computeSafetyStock({
      recentDailyConsumption: [10, 10, 10, 10, 10, 10, 10],
      leadTimeDays: 3,
      configuredSafetyStockQty: null,
      minStockQty: 0,
    });
    expect(result.basis).toBe("dynamic");
    expect(result.suggestedQty).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.suggestedQty)).toBe(true);
  });

  it("nunca sugere abaixo do piso min_stock mesmo quando a variabilidade é baixa", () => {
    const result = computeSafetyStock({
      recentDailyConsumption: [1, 1, 1, 1, 1, 1, 1],
      leadTimeDays: 1,
      configuredSafetyStockQty: null,
      minStockQty: 50,
    });
    expect(result.suggestedQty).toBeGreaterThanOrEqual(50);
  });
});
