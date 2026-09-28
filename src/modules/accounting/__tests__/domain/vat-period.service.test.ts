import { getVatPeriodRange, currentVatPeriod, periodsInYear } from "../../domain/services/vat-period.service.js";
import { InvalidVatPeriodError } from "../../domain/errors.js";

describe("getVatPeriodRange — trimestral", () => {
  it("Q1 é sempre Jan-Mar", () => {
    expect(getVatPeriodRange("quarterly", 2026, 1)).toEqual({ from: "2026-01-01", to: "2026-03-31" });
  });

  it("Q3 é Jul-Set", () => {
    expect(getVatPeriodRange("quarterly", 2026, 3)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
  });

  it("Q4 é Out-Dez", () => {
    expect(getVatPeriodRange("quarterly", 2026, 4)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
  });

  it("rejeita um trimestre fora de 1-4", () => {
    expect(() => getVatPeriodRange("quarterly", 2026, 5)).toThrow(InvalidVatPeriodError);
  });
});

describe("getVatPeriodRange — mensal", () => {
  it("período 1 é Janeiro inteiro", () => {
    expect(getVatPeriodRange("monthly", 2026, 1)).toEqual({ from: "2026-01-01", to: "2026-01-31" });
  });

  it("período 2 respeita fevereiro num ano bissexto", () => {
    expect(getVatPeriodRange("monthly", 2028, 2)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("período 12 é Dezembro inteiro", () => {
    expect(getVatPeriodRange("monthly", 2026, 12)).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("rejeita um mês fora de 1-12", () => {
    expect(() => getVatPeriodRange("monthly", 2026, 13)).toThrow(InvalidVatPeriodError);
  });
});

describe("periodsInYear", () => {
  it("12 para mensal, 4 para trimestral", () => {
    expect(periodsInYear("monthly")).toBe(12);
    expect(periodsInYear("quarterly")).toBe(4);
  });
});

describe("currentVatPeriod", () => {
  it("deriva o trimestre a partir de uma data explícita", () => {
    expect(currentVatPeriod("quarterly", new Date(Date.UTC(2026, 7, 15)))).toEqual({ year: 2026, period: 3 });
  });

  it("deriva o mês a partir de uma data explícita", () => {
    expect(currentVatPeriod("monthly", new Date(Date.UTC(2026, 7, 15)))).toEqual({ year: 2026, period: 8 });
  });
});
