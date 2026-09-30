import { computeStockProjection } from "../../domain/services/stock-projection.service.js";

describe("computeStockProjection", () => {
  it("dia normal: projeta stock e calcula cobertura/rutura", () => {
    const result = computeStockProjection(30, [
      { date: "2026-10-01", expectedConsumption: 10 },
      { date: "2026-10-02", expectedConsumption: 10 },
      { date: "2026-10-03", expectedConsumption: 10 },
      { date: "2026-10-04", expectedConsumption: 10 },
    ]);
    expect(result.points[2]?.projectedStock).toBe(0);
    expect(result.ruptureDate).toBe("2026-10-03");
    expect(result.coverageDays).toBe(3);
  });

  it("stock teórico <= 0: nunca Infinity/NaN, rutura imediata, cobertura 0", () => {
    const result = computeStockProjection(-5, [{ date: "2026-10-01", expectedConsumption: 3 }]);
    expect(Number.isFinite(result.points[0]!.projectedStock)).toBe(true);
    expect(result.coverageDays).toBe(0);
    expect(result.ruptureDate).toBe("2026-10-01");
  });

  it("sem consumo previsto nenhum: cobertura null (nunca Infinity), sem rutura", () => {
    const result = computeStockProjection(50, [
      { date: "2026-10-01", expectedConsumption: 0 },
      { date: "2026-10-02", expectedConsumption: 0 },
    ]);
    expect(result.coverageDays).toBeNull();
    expect(result.ruptureDate).toBeNull();
  });

  it("nunca cruza rutura dentro do horizonte → ruptureDate null", () => {
    const result = computeStockProjection(1000, [
      { date: "2026-10-01", expectedConsumption: 5 },
      { date: "2026-10-02", expectedConsumption: 5 },
    ]);
    expect(result.ruptureDate).toBeNull();
    // Cobertura é limitada aos dias efetivamente projetados no horizonte —
    // aqui o horizonte só tem 2 dias de consumo previsto, então a cobertura
    // "estaciona" em 2 (nunca extrapola para além do que foi projetado).
    expect(result.coverageDays).toBe(2);
  });

  it("cobertura parcial de um dia é fracionária, não arredondada para baixo/cima artificialmente", () => {
    const result = computeStockProjection(5, [{ date: "2026-10-01", expectedConsumption: 10 }]);
    expect(result.coverageDays).toBeCloseTo(0.5, 6);
  });
});
