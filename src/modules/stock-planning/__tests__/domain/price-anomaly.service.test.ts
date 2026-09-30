import { detectPriceAnomaly } from "../../domain/services/price-anomaly.service.js";

describe("detectPriceAnomaly", () => {
  it("última compra muito acima da referência → anomalia", () => {
    const result = detectPriceAnomaly({ lastPurchaseUnitCost: 1.3, referenceUnitCost: 1, thresholdPercent: 0.15 });
    expect(result.isAnomaly).toBe(true);
    expect(result.deviationPercent).toBeCloseTo(0.3, 6);
  });

  it("dentro do limiar → sem anomalia", () => {
    const result = detectPriceAnomaly({ lastPurchaseUnitCost: 1.05, referenceUnitCost: 1, thresholdPercent: 0.15 });
    expect(result.isAnomaly).toBe(false);
  });

  it("sem referência ou sem última compra → nunca lança, devolve null", () => {
    expect(detectPriceAnomaly({ lastPurchaseUnitCost: null, referenceUnitCost: 1, thresholdPercent: 0.15 })).toEqual({
      isAnomaly: false,
      deviationPercent: null,
    });
    expect(detectPriceAnomaly({ lastPurchaseUnitCost: 1, referenceUnitCost: null, thresholdPercent: 0.15 })).toEqual({
      isAnomaly: false,
      deviationPercent: null,
    });
  });
});
