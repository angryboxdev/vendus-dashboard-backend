import { computeBacktest } from "../../domain/services/backtest.service.js";

describe("computeBacktest", () => {
  it("sem pontos, devolve valores neutros sem lançar", () => {
    const result = computeBacktest([]);
    expect(result).toEqual({ mae: 0, wape: null, bias: null, sampleSize: 0 });
  });

  it("calcula MAE/WAPE/bias corretamente", () => {
    const result = computeBacktest([
      { predicted: 10, actual: 8 },
      { predicted: 5, actual: 5 },
      { predicted: 0, actual: 2 },
    ]);
    // erros: 2, 0, -2 → |erros| soma 4, actual soma 15
    expect(result.mae).toBeCloseTo(4 / 3, 6);
    expect(result.wape).toBeCloseTo(4 / 15, 6);
    expect(result.bias).toBeCloseTo(0 / 15, 6);
    expect(result.sampleSize).toBe(3);
  });

  it("actual sempre 0 → wape/bias null, nunca Infinity/NaN", () => {
    const result = computeBacktest([
      { predicted: 5, actual: 0 },
      { predicted: 3, actual: 0 },
    ]);
    expect(result.wape).toBeNull();
    expect(result.bias).toBeNull();
    expect(Number.isFinite(result.mae)).toBe(true);
  });
});
