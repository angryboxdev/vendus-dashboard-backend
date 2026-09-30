import { computeNextDeliveryWindows, computeReplenishment } from "../../domain/services/replenishment.service.js";

describe("computeNextDeliveryWindows", () => {
  it("sem calendário configurado, devolve lista vazia — nunca inventa uma janela", () => {
    expect(computeNextDeliveryWindows(null, null, "2026-10-01", null, 2)).toEqual([]);
  });

  it("calcula D1/D2 a partir dos dias da semana configurados", () => {
    // 2026-10-01 é quinta-feira (weekday ISO 4); fornecedor entrega às terças(2) e sextas(5).
    const windows = computeNextDeliveryWindows([2, 5], null, "2026-10-01", null, 2);
    expect(windows).toEqual([{ date: "2026-10-02" }, { date: "2026-10-06" }]);
  });

  it("respeita a hora limite — depois do cutoff, empurra para o próximo dia elegível", () => {
    const windows = computeNextDeliveryWindows([4], "12:00", "2026-10-01", "14:00", 1);
    // hoje (quinta) já passou do cutoff → próxima quinta-feira, não hoje
    expect(windows).toEqual([{ date: "2026-10-08" }]);
  });
});

describe("computeReplenishment", () => {
  it("sem gap, sugere 0", () => {
    const result = computeReplenishment({ projectedStockAtWindow: 20, targetStock: 15, packaging: null });
    expect(result.suggestedBaseQty).toBe(0);
  });

  it("com embalagem conhecida, arredonda para cima em embalagens completas", () => {
    const result = computeReplenishment({
      projectedStockAtWindow: 2,
      targetStock: 25,
      packaging: { conversionFactor: 10, purchaseUnit: "saco" },
    });
    expect(result.suggestedBaseQty).toBe(23);
    expect(result.suggestedPurchaseQty).toBe(3);
    expect(result.purchaseUnit).toBe("saco");
  });

  it("sem embalagem conhecida, sugere só a quantidade base — nunca inventa um pack size", () => {
    const result = computeReplenishment({ projectedStockAtWindow: 2, targetStock: 25, packaging: null });
    expect(result.suggestedBaseQty).toBe(23);
    expect(result.suggestedPurchaseQty).toBeNull();
    expect(result.purchaseUnit).toBeNull();
  });
});
