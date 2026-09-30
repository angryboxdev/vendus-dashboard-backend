import { classifyRisk } from "../../domain/services/risk-classification.service.js";

describe("classifyRisk", () => {
  it("com data de rutura prevista, é sempre crítico (mesmo se também parado)", () => {
    expect(classifyRisk({ ruptureDate: "2026-10-05", coverageDays: 1, isSlowMoving: true, attentionCoverageDaysThreshold: 7 })).toBe("critico");
  });

  it("sem rutura mas parado (excesso/slow-moving)", () => {
    expect(classifyRisk({ ruptureDate: null, coverageDays: 90, isSlowMoving: true, attentionCoverageDaysThreshold: 7 })).toBe("excesso");
  });

  it("sem rutura, cobertura baixa mas não parado → atenção", () => {
    expect(classifyRisk({ ruptureDate: null, coverageDays: 5, isSlowMoving: false, attentionCoverageDaysThreshold: 7 })).toBe("atencao");
  });

  it("cobertura confortável e não parado → ok", () => {
    expect(classifyRisk({ ruptureDate: null, coverageDays: 30, isSlowMoving: false, attentionCoverageDaysThreshold: 7 })).toBe("ok");
  });

  it("sem consumo previsto (coverageDays null) e não parado → ok", () => {
    expect(classifyRisk({ ruptureDate: null, coverageDays: null, isSlowMoving: false, attentionCoverageDaysThreshold: 7 })).toBe("ok");
  });
});
