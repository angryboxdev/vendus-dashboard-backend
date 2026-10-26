import { StockItemBaseUnitLockedError, isBaseUnitChangeBlocked } from "../stockItemService.js";

describe("unidade de stock bloqueada depois do 1.º uso", () => {
  test("artigo sem nada registado pode mudar de unidade; com movimentos/compras/receitas não", () => {
    expect(isBaseUnitChangeBlocked("g", "kg", false)).toBe(false);
    expect(isBaseUnitChangeBlocked("g", "kg", true)).toBe(true);
    expect(isBaseUnitChangeBlocked("g", "g", true)).toBe(false);
  });

  test("mensagem explica o porquê e a alternativa", () => {
    const e = new StockItemBaseUnitLockedError("Cheddar Ralado", "g", "kg");
    expect(e.message).toMatch(/Não é possível mudar a unidade de «Cheddar Ralado» de g para kg/);
    expect(e.message).toMatch(/preços já aparecem por kg\/l/);
  });
});
