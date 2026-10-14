import { suggestStockRouting } from "../../domain/services/stock-routing-suggestion.service.js";

describe("Sugestão «Enviar para Stock» (F2 §2.1)", () => {
  test("ingredientes (categoria com impacto) sugere marcado; energia/serviços sugere desmarcado", () => {
    expect(suggestStockRouting({ locationPolicy: null, supplierPolicy: "inherit", categoryPolicies: ["CREATE_REVIEW"] })).toMatchObject({ send: true, source: "category" });
    expect(suggestStockRouting({ locationPolicy: null, supplierPolicy: "inherit", categoryPolicies: ["NO_STOCK_EFFECT"] })).toMatchObject({ send: false, source: "category" });
  });

  test("política explícita do fornecedor prevalece sobre a categoria", () => {
    expect(suggestStockRouting({ locationPolicy: null, supplierPolicy: "usually_skips_review", categoryPolicies: ["CREATE_REVIEW"] })).toMatchObject({ send: false, source: "supplier" });
  });

  test("exceção da loja prevalece sobre a regra geral do fornecedor", () => {
    expect(suggestStockRouting({ locationPolicy: "usually_creates_review", supplierPolicy: "usually_skips_review", categoryPolicies: [] })).toMatchObject({ send: true, source: "supplier_location" });
    // Exceção «seguir a categoria» não anula a regra geral.
    expect(suggestStockRouting({ locationPolicy: "inherit", supplierPolicy: "usually_skips_review", categoryPolicies: [] })).toMatchObject({ send: false, source: "supplier" });
  });

  test("«Decidir no documento» exige decisão explícita (não equivale a «Não enviar»)", () => {
    expect(suggestStockRouting({ locationPolicy: null, supplierPolicy: "decide_per_document", categoryPolicies: ["CREATE_REVIEW"] })).toEqual(expect.objectContaining({ send: null, requiresDecision: true }));
  });

  test("fornecedor misto sem sinal: sem predefinição, sem obrigar", () => {
    expect(suggestStockRouting({ locationPolicy: null, supplierPolicy: "inherit", categoryPolicies: ["CREATE_REVIEW", "NO_STOCK_EFFECT"] })).toMatchObject({ send: true });
    expect(suggestStockRouting({ locationPolicy: null, supplierPolicy: null, categoryPolicies: ["UNDEFINED"] })).toMatchObject({ send: null, source: "none", requiresDecision: false });
  });
});
