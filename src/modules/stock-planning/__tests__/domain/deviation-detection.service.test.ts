import { detectDeviation } from "../../domain/services/deviation-detection.service.js";

describe("detectDeviation", () => {
  it("desvio material: percentagem E impacto absoluto acima do limiar → true", () => {
    const result = detectDeviation({ forecastValue: 100, actualValue: 150, percentThreshold: 0.2, absoluteThreshold: 10 });
    expect(result.isMaterial).toBe(true);
    expect(result.deviationPercent).toBeCloseTo(0.5, 6);
  });

  it("ruído — percentagem grande mas impacto absoluto irrelevante → nunca material", () => {
    // 100% de desvio, mas só 1 unidade de impacto absoluto.
    const result = detectDeviation({ forecastValue: 1, actualValue: 2, percentThreshold: 0.2, absoluteThreshold: 10 });
    expect(result.isMaterial).toBe(false);
  });

  it("impacto absoluto grande mas percentagem pequena → nunca material", () => {
    const result = detectDeviation({ forecastValue: 10000, actualValue: 10050, percentThreshold: 0.2, absoluteThreshold: 10 });
    expect(result.isMaterial).toBe(false);
  });

  it("forecastValue <= 0 → deviationPercent null, nunca Infinity/NaN", () => {
    const result = detectDeviation({ forecastValue: 0, actualValue: 5, percentThreshold: 0.2, absoluteThreshold: 1 });
    expect(result.deviationPercent).toBeNull();
    expect(Number.isFinite(result.deviationAbsolute)).toBe(true);
  });
});
