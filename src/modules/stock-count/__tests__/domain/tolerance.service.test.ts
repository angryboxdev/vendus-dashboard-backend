import { resolveTolerance } from "../../domain/services/tolerance.service.js";

describe("resolveTolerance — hierarquia item → categoria → empresa", () => {
  it("item definido vence como bloco completo, mesmo que categoria/empresa também definam", () => {
    const result = resolveTolerance({
      itemTolerance: { absoluteQty: 1 },
      categoryTolerance: { percent: 0.1 },
      companyDefaultTolerance: { financialImpact: 50 },
    });
    expect(result).toEqual({ absoluteQty: 1 });
  });

  it("sem item, categoria vence como bloco completo", () => {
    const result = resolveTolerance({
      itemTolerance: null,
      categoryTolerance: { percent: 0.05, financialImpact: 20 },
      companyDefaultTolerance: { absoluteQty: 1 },
    });
    expect(result).toEqual({ percent: 0.05, financialImpact: 20 });
  });

  it("sem item nem categoria, empresa vence", () => {
    const result = resolveTolerance({
      itemTolerance: null,
      categoryTolerance: null,
      companyDefaultTolerance: { absoluteQty: 2 },
    });
    expect(result).toEqual({ absoluteQty: 2 });
  });

  it("nenhum nível definido ⇒ null, nunca inventa uma percentagem padrão", () => {
    const result = resolveTolerance({ itemTolerance: null, categoryTolerance: null, companyDefaultTolerance: null });
    expect(result).toBeNull();
  });

  it("um objeto com todos os campos null/undefined conta como 'não definido' (bloco vazio salta para o próximo nível)", () => {
    const result = resolveTolerance({
      itemTolerance: { absoluteQty: null, percent: null, financialImpact: null },
      categoryTolerance: { absoluteQty: 3 },
      companyDefaultTolerance: null,
    });
    expect(result).toEqual({ absoluteQty: 3 });
  });

  it("nunca faz merge campo-a-campo entre níveis", () => {
    const result = resolveTolerance({
      itemTolerance: { absoluteQty: 1 },
      categoryTolerance: { percent: 0.2 },
      companyDefaultTolerance: null,
    });
    expect(result).toEqual({ absoluteQty: 1 });
    expect(result).not.toHaveProperty("percent");
  });
});
