import { describe, it, expect } from "@jest/globals";
import { isStrongSuggestion, scoreCandidate, supplierNameInDescription } from "../../domain/services/candidate-scoring.service.js";

// Dados fictícios.
const base = {
  candidateAmount: 12_345,
  candidateOpenBalance: 12_345,
  candidateDates: ["2026-09-10"],
  candidateName: "Fornecedor Exemplo Lda",
  candidateSupplierId: "sup-1",
  movementAmount: 12_345,
  movementDate: new Date("2026-09-12T00:00:00.000Z"),
  movementDesc: "TRF P/ FORNECEDOR EXEMPLO LDA",
  hintSupplierId: null,
};

describe("supplierNameInDescription", () => {
  it("short brand names count, legal forms don't", () => {
    expect(supplierNameInDescription("EDP SA", "PAGAMENTO EDP SA")).toBe(true);
    expect(supplierNameInDescription("NOS Comunicações SA", "DD NOS COMUNICACOES 0099")).toBe(true);
    expect(supplierNameInDescription("Outra Lda", "TRF P/ EXEMPLO LDA")).toBe(false);
  });

  it("matches whole words only", () => {
    expect(supplierNameInDescription("Meo", "COMPRA MEOWSHOP")).toBe(false);
  });
});

describe("scoreCandidate / isStrongSuggestion", () => {
  it("name + exact amount + close date → strong (≥ 90%)", () => {
    const s = scoreCandidate(base);
    expect(s).toEqual({ confidence: 0.95, nameMatched: true, amountMatched: true });
    expect(isStrongSuggestion(s)).toBe(true);
  });

  it("amount and date without the name → not a suggestion", () => {
    const s = scoreCandidate({ ...base, movementDesc: "TRF P/ OUTRA EMPRESA" });
    expect(s.nameMatched).toBe(false);
    expect(isStrongSuggestion(s)).toBe(false);
  });

  it("name but a different amount → not a suggestion", () => {
    const s = scoreCandidate({ ...base, candidateAmount: 12_600, candidateOpenBalance: 12_600 });
    expect(s.amountMatched).toBe(false);
    expect(isStrongSuggestion(s)).toBe(false);
  });

  it("name and amount with a far date still count (80% ≥ 70%)", () => {
    const s = scoreCandidate({ ...base, candidateDates: ["2026-07-01"] });
    expect(s.confidence).toBeCloseTo(0.8);
    expect(isStrongSuggestion(s)).toBe(true);
  });

  it("uses the date closest to the movement (card purchase: issued same day, due 30 days later)", () => {
    const s = scoreCandidate({ ...base, candidateDates: [null, "2026-10-12", "2026-09-12"] });
    expect(s.confidence).toBeCloseTo(0.95);
  });

  it("below 70% is never a suggestion, even with name and amount flags", () => {
    expect(isStrongSuggestion({ confidence: 0.69, nameMatched: true, amountMatched: true })).toBe(false);
  });

  it("learned supplier counts as the name", () => {
    const s = scoreCandidate({ ...base, movementDesc: "TRF 0099 REF X", hintSupplierId: "sup-1", candidateDates: ["2026-08-20"] });
    expect(s.nameMatched).toBe(true);
    expect(s.confidence).toBeCloseTo(1);
    expect(isStrongSuggestion(s)).toBe(true);
  });

  it("open balance within 1 € also counts as the amount (invoice partly paid)", () => {
    const s = scoreCandidate({ ...base, candidateAmount: 20_000, candidateOpenBalance: 12_300 });
    expect(s.amountMatched).toBe(true);
  });
});
