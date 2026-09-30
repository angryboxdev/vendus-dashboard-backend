import { decideStockReview } from "../../domain/services/stock-review-decision.service.js";

describe("decideStockReview — Caso 1 (override)", () => {
  it("force_create decide criar, sem exigir motivo", () => {
    const result = decideStockReview({
      override: "force_create",
      overrideReason: null,
      lineCategoryPolicies: ["NO_STOCK_EFFECT"],
      supplierDefaultPolicy: "inherit",
    });
    expect(result).toEqual({ outcome: "create", source: "override", policyUsed: "force_create" });
  });

  it("force_skip sem motivo, quando a categoria diria CREATE_REVIEW, degrada para unresolved (nunca bloqueia a fatura nem honra o skip silenciosamente)", () => {
    const result = decideStockReview({
      override: "force_skip",
      overrideReason: null,
      lineCategoryPolicies: ["CREATE_REVIEW"],
      supplierDefaultPolicy: "inherit",
    });
    expect(result.outcome).toBe("unresolved");
    expect(result.source).toBe("unresolved");
  });

  it("force_skip COM motivo, mesmo quando a categoria diria CREATE_REVIEW, é honrado", () => {
    const result = decideStockReview({
      override: "force_skip",
      overrideReason: "Fatura de amostra, sem stock real",
      lineCategoryPolicies: ["CREATE_REVIEW"],
      supplierDefaultPolicy: "inherit",
    });
    expect(result).toEqual({ outcome: "skip", source: "override", policyUsed: "force_skip" });
  });

  it("force_skip sem motivo, quando nada normalmente criaria, não precisa de motivo", () => {
    const result = decideStockReview({
      override: "force_skip",
      overrideReason: null,
      lineCategoryPolicies: ["NO_STOCK_EFFECT"],
      supplierDefaultPolicy: "inherit",
    });
    expect(result).toEqual({ outcome: "skip", source: "override", policyUsed: "force_skip" });
  });
});

describe("decideStockReview — Caso 2/3 (categoria em modo automático)", () => {
  it("qualquer categoria CREATE_REVIEW decide criar, mesmo com outras NO_STOCK_EFFECT", () => {
    const result = decideStockReview({
      override: "auto",
      overrideReason: null,
      lineCategoryPolicies: ["NO_STOCK_EFFECT", "CREATE_REVIEW"],
      supplierDefaultPolicy: "usually_skips_review",
    });
    expect(result).toEqual({ outcome: "create", source: "category", policyUsed: "CREATE_REVIEW" });
  });

  it("a preferência do fornecedor nunca cancela um sinal de categoria CREATE_REVIEW", () => {
    const result = decideStockReview({
      override: "auto",
      overrideReason: null,
      lineCategoryPolicies: ["CREATE_REVIEW"],
      supplierDefaultPolicy: "usually_skips_review",
    });
    expect(result.outcome).toBe("create");
  });

  it("todas as categorias NO_STOCK_EFFECT decide não criar", () => {
    const result = decideStockReview({
      override: "auto",
      overrideReason: null,
      lineCategoryPolicies: ["NO_STOCK_EFFECT", "NO_STOCK_EFFECT"],
      supplierDefaultPolicy: "usually_creates_review",
    });
    expect(result).toEqual({ outcome: "skip", source: "category", policyUsed: "NO_STOCK_EFFECT" });
  });
});

describe("decideStockReview — Caso 4 (fallback para o fornecedor)", () => {
  it("categoria UNDEFINED + fornecedor usually_creates_review decide criar", () => {
    const result = decideStockReview({
      override: "auto",
      overrideReason: null,
      lineCategoryPolicies: ["UNDEFINED"],
      supplierDefaultPolicy: "usually_creates_review",
    });
    expect(result).toEqual({ outcome: "create", source: "supplier", policyUsed: "usually_creates_review" });
  });

  it("categoria UNDEFINED + fornecedor usually_skips_review decide não criar", () => {
    const result = decideStockReview({
      override: "auto",
      overrideReason: null,
      lineCategoryPolicies: ["UNDEFINED"],
      supplierDefaultPolicy: "usually_skips_review",
    });
    expect(result).toEqual({ outcome: "skip", source: "supplier", policyUsed: "usually_skips_review" });
  });

  it("sem linhas (fatura em modo resumo) usa a preferência do fornecedor", () => {
    const result = decideStockReview({
      override: "auto",
      overrideReason: null,
      lineCategoryPolicies: [],
      supplierDefaultPolicy: "usually_creates_review",
    });
    expect(result.outcome).toBe("create");
  });
});

describe("decideStockReview — Caso 5 (inconclusivo)", () => {
  it("categoria UNDEFINED + fornecedor inherit fica unresolved, nunca gera movimento sozinho", () => {
    const result = decideStockReview({
      override: "auto",
      overrideReason: null,
      lineCategoryPolicies: ["UNDEFINED"],
      supplierDefaultPolicy: "inherit",
    });
    expect(result.outcome).toBe("unresolved");
  });
});
