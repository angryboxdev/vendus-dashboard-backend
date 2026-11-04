import { atcud, documentNumber, printedAtcud, validateSeriesId } from "../../domain/services/series.service.js";

describe("ATCUD (Portaria 195/2020, arts. 3.º e 4.º)", () => {
  it("é o código de validação da série + «-» + o número que segue a «/» (exemplos da especificação QR)", () => {
    expect(atcud("CSDF7T5H", "FT AB2019/0035")).toBe("CSDF7T5H-0035");
    expect(atcud("CDF7T5HD", "FS CDVF/12345")).toBe("CDF7T5HD-12345");
  });

  it("imprime-se como «ATCUD:código-número»", () => {
    expect(printedAtcud("CSDF7T5H-0035")).toBe("ATCUD:CSDF7T5H-0035");
  });

  it("recusa código de validação com menos de 8 caracteres", () => {
    expect(() => atcud("ABC1234", "FT A/1")).toThrow();
  });
});

describe("identificador da série (Manual de Comunicação de Séries, §1.3.2)", () => {
  it.each(["L01-2027", "A2027", "LOJA.1_2027", "a".repeat(35)])("aceita %s", (id) => {
    expect(() => validateSeriesId(id)).not.toThrow();
  });

  it.each([
    ["vazio", ""],
    ["mais de 35 caracteres", "a".repeat(36)],
    ["começa por AT", "AT2027"],
    ["começa por at (sem distinguir maiúsculas)", "at2027"],
    ["separador no início", "-A2027"],
    ["separador no fim", "A2027_"],
    ["separadores seguidos", "A--2027"],
    ["espaço", "A 2027"],
    ["barra", "A/2027"],
  ])("recusa %s", (_, id) => {
    expect(() => validateSeriesId(id)).toThrow();
  });
});

describe("número do documento (Despacho 8632/2014, 1.7; SAF-T InvoiceNo)", () => {
  it("é «TIPO SÉRIE/NÚMERO», com número só em dígitos", () => {
    expect(documentNumber("FT", "L01-2027", 1)).toBe("FT L01-2027/1");
  });

  it("recusa número não inteiro positivo", () => {
    expect(() => documentNumber("FT", "L01-2027", 0)).toThrow();
    expect(() => documentNumber("FT", "L01-2027", 1.5)).toThrow();
  });
});
