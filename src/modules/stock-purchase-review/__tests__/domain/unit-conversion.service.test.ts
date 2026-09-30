import { validateConversion } from "../../domain/services/unit-conversion.service.js";

describe("validateConversion", () => {
  it("nunca sinaliza par da mesma dimensão (massa→massa)", () => {
    expect(validateConversion("kg", "g")).toEqual({ flagged: false, reason: null });
  });

  it("nunca sinaliza par da mesma dimensão (volume→volume)", () => {
    expect(validateConversion("l", "ml")).toEqual({ flagged: false, reason: null });
  });

  it("sinaliza (nunca bloqueia) um par dimensionalmente suspeito, ex: kg→L", () => {
    const result = validateConversion("kg", "l");
    expect(result.flagged).toBe(true);
    expect(result.reason).toContain("kg");
  });

  it("nunca sinaliza uma unidade desconhecida (evita falso positivo)", () => {
    expect(validateConversion("caixa", "un")).toEqual({ flagged: false, reason: null });
  });
});
