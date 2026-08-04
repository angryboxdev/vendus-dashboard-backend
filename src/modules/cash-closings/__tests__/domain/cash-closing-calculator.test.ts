import { CashClosingCalculator } from "../../domain/services/cash-closing-calculator.js";

describe("CashClosingCalculator", () => {
  describe("computeTotal", () => {
    it("soma todos os canais corretamente", () => {
      const result = CashClosingCalculator.computeTotal({
        tpa: 100.50,
        uber: 50.25,
        glovo: 30.10,
        bolt: 20.00,
        eatz: 10.00,
        cashSales: 80.15,
      });
      expect(result).toBe(291.00);
    });

    it("devolve 0 quando todos os canais são 0", () => {
      const result = CashClosingCalculator.computeTotal({
        tpa: 0, uber: 0, glovo: 0, bolt: 0, eatz: 0, cashSales: 0,
      });
      expect(result).toBe(0);
    });

    it("arredonda a 2 casas decimais", () => {
      const result = CashClosingCalculator.computeTotal({
        tpa: 0.1, uber: 0.2, glovo: 0, bolt: 0, eatz: 0, cashSales: 0,
      });
      expect(result).toBe(0.30);
    });
  });

  describe("computeVendusSubtotal", () => {
    it("soma TPA + Eatz + Dinheiro", () => {
      const result = CashClosingCalculator.computeVendusSubtotal({
        tpa: 200, eatz: 10, cashSales: 100,
      });
      expect(result).toBe(310);
    });

    it("devolve 0 quando todos os canais são 0", () => {
      expect(CashClosingCalculator.computeVendusSubtotal({ tpa: 0, eatz: 0, cashSales: 0 })).toBe(0);
    });

    it("arredonda a 2 casas decimais", () => {
      expect(CashClosingCalculator.computeVendusSubtotal({ tpa: 0.1, eatz: 0.2, cashSales: 0 })).toBe(0.30);
    });
  });

  describe("computeAirMenuSubtotal", () => {
    it("soma Uber + Glovo + Bolt", () => {
      const result = CashClosingCalculator.computeAirMenuSubtotal({
        uber: 50, glovo: 30, bolt: 20,
      });
      expect(result).toBe(100);
    });

    it("devolve 0 quando todos os canais são 0", () => {
      expect(CashClosingCalculator.computeAirMenuSubtotal({ uber: 0, glovo: 0, bolt: 0 })).toBe(0);
    });

    it("arredonda a 2 casas decimais", () => {
      expect(CashClosingCalculator.computeAirMenuSubtotal({ uber: 0.1, glovo: 0.2, bolt: 0 })).toBe(0.30);
    });
  });

  describe("computeSangria", () => {
    it("devolve 0 quando gaveta é igual a 100", () => {
      expect(CashClosingCalculator.computeSangria(100)).toBe(0);
    });

    it("devolve 0 quando gaveta é menor que 100", () => {
      expect(CashClosingCalculator.computeSangria(50)).toBe(0);
    });

    it("calcula sangria correctamente quando gaveta > 100", () => {
      expect(CashClosingCalculator.computeSangria(350.75)).toBe(250.75);
    });

    it("arredonda sangria a 2 casas decimais", () => {
      // 100.125 - 100 = 0.125; Math.round(12.5) = 13 → 0.13
      expect(CashClosingCalculator.computeSangria(100.125)).toBe(0.13);
    });
  });
});
