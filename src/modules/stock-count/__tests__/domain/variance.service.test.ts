import { breachesTolerance, computeFinancialImpact, computeVariance } from "../../domain/services/variance.service.js";

describe("computeVariance", () => {
  it("variância normal: teórico positivo, contado diferente", () => {
    const result = computeVariance(8, 10);
    expect(result.absolute).toBe(-2);
    expect(result.percent).toBeCloseTo(0.2);
  });

  it("sem diferença: absolute 0, percent 0", () => {
    const result = computeVariance(10, 10);
    expect(result.absolute).toBe(0);
    expect(result.percent).toBe(0);
  });

  it("contado explicitamente zero (não confundir com 'não contado')", () => {
    const result = computeVariance(0, 10);
    expect(result.absolute).toBe(-10);
    expect(result.percent).toBe(1);
  });

  it("teórico zero ⇒ percent null, nunca Infinity/NaN", () => {
    const result = computeVariance(5, 0);
    expect(result.percent).toBeNull();
    expect(Number.isFinite(result.absolute)).toBe(true);
  });

  it("teórico negativo (stock corrompido) ⇒ percent null, sem crash", () => {
    const result = computeVariance(5, -3);
    expect(result.percent).toBeNull();
    expect(result.absolute).toBe(8);
  });
});

describe("computeFinancialImpact", () => {
  it("null quando não há custo unitário confiável", () => {
    expect(computeFinancialImpact(-2, null)).toBeNull();
    expect(computeFinancialImpact(-2, undefined)).toBeNull();
    expect(computeFinancialImpact(-2, Number.NaN)).toBeNull();
  });

  it("multiplica a variância absoluta pelo custo unitário quando existe", () => {
    expect(computeFinancialImpact(-2, 3.5)).toBeCloseTo(-7);
  });
});

describe("breachesTolerance", () => {
  it("sem tolerância configurada, nunca dispara recontagem automática sozinha", () => {
    expect(breachesTolerance({ absolute: 100, percent: 1 }, 1000, null)).toBe(false);
  });

  it("dispara por quantidade absoluta", () => {
    expect(breachesTolerance({ absolute: 5, percent: 0.1 }, null, { absoluteQty: 2 })).toBe(true);
    expect(breachesTolerance({ absolute: 1, percent: 0.1 }, null, { absoluteQty: 2 })).toBe(false);
  });

  it("dispara por percentagem, só quando percent não é null", () => {
    expect(breachesTolerance({ absolute: 5, percent: 0.2 }, null, { percent: 0.1 })).toBe(true);
    expect(breachesTolerance({ absolute: 5, percent: null }, null, { percent: 0.1 })).toBe(false);
  });

  it("dispara por impacto financeiro, só quando financialImpact calculado não é null", () => {
    expect(breachesTolerance({ absolute: 5, percent: 0.05 }, 100, { financialImpact: 50 })).toBe(true);
    expect(breachesTolerance({ absolute: 5, percent: 0.05 }, null, { financialImpact: 50 })).toBe(false);
  });

  it("dentro de todos os limites configurados ⇒ false", () => {
    expect(breachesTolerance({ absolute: 1, percent: 0.02 }, 10, { absoluteQty: 5, percent: 0.1, financialImpact: 100 })).toBe(false);
  });
});
