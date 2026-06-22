import { CostCenterCategory } from "../../domain/entities/cost-center-category.js";
import { InvalidFinancialTypeError } from "../../domain/errors.js";

const GROUP_ID = "group-uuid-123";

describe("CostCenterCategory", () => {
  describe("create", () => {
    it("cria uma categoria com valores padrão corretos", () => {
      const cat = CostCenterCategory.create({
        groupId: GROUP_ID,
        code: "opd.01",
        name: "CMV / Ingredientes",
        financialType: "cmv",
        affectsDre: true,
        affectsCashflow: true,
        affectsProfitability: true,
      });

      expect(cat.code).toBe("OPD.01");
      expect(cat.name).toBe("CMV / Ingredientes");
      expect(cat.groupId).toBe(GROUP_ID);
      expect(cat.financialType).toBe("cmv");
      expect(cat.affectsDre).toBe(true);
      expect(cat.affectsCashflow).toBe(true);
      expect(cat.affectsProfitability).toBe(true);
      expect(cat.requiresChannel).toBe(false);
      expect(cat.requiresAllocation).toBe(false);
      expect(cat.isActive).toBe(true);
      expect(cat.description).toBeNull();
    });

    it("normaliza código para maiúsculas e faz trim", () => {
      const cat = CostCenterCategory.create({
        groupId: GROUP_ID,
        code: "  opd.03  ",
        name: "Embalagens",
        financialType: "variable_cost",
        affectsDre: true,
        affectsCashflow: true,
        affectsProfitability: true,
        requiresChannel: true,
      });

      expect(cat.code).toBe("OPD.03");
      expect(cat.requiresChannel).toBe(true);
    });
  });

  describe("update", () => {
    it("actualiza campos editáveis e retorna nova instância imutável", () => {
      const original = CostCenterCategory.create({
        groupId: GROUP_ID,
        code: "CAP.01",
        name: "Equipamentos",
        financialType: "capex",
        affectsDre: false,
        affectsCashflow: true,
        affectsProfitability: false,
      });

      const updated = original.update({ name: "Equipamentos e Máquinas", requiresAllocation: true });

      expect(updated.name).toBe("Equipamentos e Máquinas");
      expect(updated.requiresAllocation).toBe(true);
      expect(updated.id).toBe(original.id);
      expect(updated.code).toBe(original.code);
      expect(original.name).toBe("Equipamentos");
    });
  });

  describe("invariante financialType", () => {
    it("rejeita financialType inválido em create", () => {
      expect(() =>
        CostCenterCategory.create({
          groupId: GROUP_ID,
          code: "OPD.01",
          name: "Teste",
          financialType: "invalid_type" as never,
          affectsDre: true,
          affectsCashflow: true,
          affectsProfitability: true,
        }),
      ).toThrow(InvalidFinancialTypeError);
    });

    it("rejeita financialType inválido em update", () => {
      const cat = CostCenterCategory.create({
        groupId: GROUP_ID,
        code: "OPD.01",
        name: "Teste",
        financialType: "cmv",
        affectsDre: true,
        affectsCashflow: true,
        affectsProfitability: true,
      });

      expect(() => cat.update({ financialType: "garbage" as never })).toThrow(InvalidFinancialTypeError);
    });
  });

  describe("activate / deactivate", () => {
    it("deactivate devolve categoria inativa sem mutar original", () => {
      const cat = CostCenterCategory.create({
        groupId: GROUP_ID,
        code: "FDR.01",
        name: "Retirada de Sócios",
        financialType: "off_dre",
        affectsDre: false,
        affectsCashflow: true,
        affectsProfitability: false,
      });

      const inactive = cat.deactivate();
      expect(inactive.isActive).toBe(false);
      expect(cat.isActive).toBe(true);
    });

    it("activate devolve categoria ativa sem mutar original", () => {
      const cat = CostCenterCategory.create({
        groupId: GROUP_ID,
        code: "FDR.01",
        name: "Retirada de Sócios",
        financialType: "off_dre",
        affectsDre: false,
        affectsCashflow: true,
        affectsProfitability: false,
      }).deactivate();

      const active = cat.activate();
      expect(active.isActive).toBe(true);
      expect(cat.isActive).toBe(false);
    });
  });
});
