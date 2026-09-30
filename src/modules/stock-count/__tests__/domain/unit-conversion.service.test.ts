import { sumComponentsToBaseQuantity, toBaseQuantity } from "../../domain/services/unit-conversion.service.js";
import { InvalidConversionFactorError, InvalidCountedQuantityError } from "../../domain/errors.js";

describe("toBaseQuantity", () => {
  it("unidade base (fator 1) devolve a própria quantidade", () => {
    expect(toBaseQuantity({ quantity: 10, conversionFactor: 1 })).toBe(10);
  });

  it("unidade alternativa aplica o fator de conversão (ex: 'saco' de 5kg = 5000g)", () => {
    expect(toBaseQuantity({ quantity: 2, conversionFactor: 5000 })).toBe(10000);
  });

  it("rejeita fator de conversão inválido (zero, negativo, não finito)", () => {
    expect(() => toBaseQuantity({ quantity: 1, conversionFactor: 0 })).toThrow(InvalidConversionFactorError);
    expect(() => toBaseQuantity({ quantity: 1, conversionFactor: -1 })).toThrow(InvalidConversionFactorError);
    expect(() => toBaseQuantity({ quantity: 1, conversionFactor: Number.NaN })).toThrow(InvalidConversionFactorError);
  });

  it("rejeita quantidade negativa ou não finita", () => {
    expect(() => toBaseQuantity({ quantity: -1, conversionFactor: 1 })).toThrow(InvalidCountedQuantityError);
    expect(() => toBaseQuantity({ quantity: Number.NaN, conversionFactor: 1 })).toThrow(InvalidCountedQuantityError);
  });

  it("aceita quantidade explicitamente zero (zero real, não 'não contado')", () => {
    expect(toBaseQuantity({ quantity: 0, conversionFactor: 1 })).toBe(0);
  });
});

describe("sumComponentsToBaseQuantity", () => {
  it("soma múltiplas unidades de contagem sempre em unidade base", () => {
    // 2 "sacos" de 5000g + 300g avulsos = 10300g
    const total = sumComponentsToBaseQuantity([
      { quantity: 2, conversionFactor: 5000 },
      { quantity: 300, conversionFactor: 1 },
    ]);
    expect(total).toBe(10300);
  });

  it("lista vazia soma zero", () => {
    expect(sumComponentsToBaseQuantity([])).toBe(0);
  });
});
