import { CostCenter } from "../../domain/entities/cost-center.js";

describe("CostCenter", () => {
  describe("create", () => {
    it("cria um centro de custo com status active por defeito", () => {
      const cc = CostCenter.create({ code: "adm", name: "Administração", category: "administration" });
      expect(cc.status).toBe("active");
      expect(cc.id).toBeDefined();
    });

    it("normaliza o código para maiúsculas", () => {
      const cc = CostCenter.create({ code: "adm", name: "Administração", category: "administration" });
      expect(cc.code).toBe("ADM");
    });

    it("faz trim ao nome", () => {
      const cc = CostCenter.create({ code: "MKT", name: "  Marketing  ", category: "marketing" });
      expect(cc.name).toBe("Marketing");
    });

    it("define subcategoria e descrição como null quando não fornecidos", () => {
      const cc = CostCenter.create({ code: "OPE", name: "Operações", category: "operations" });
      expect(cc.subcategory).toBeNull();
      expect(cc.description).toBeNull();
      expect(cc.responsibleName).toBeNull();
    });
  });

  describe("update", () => {
    it("actualiza apenas os campos fornecidos", () => {
      const cc = CostCenter.create({ code: "ADM", name: "Administração", category: "administration" });
      const updated = cc.update({ name: "Administração Geral" });
      expect(updated.name).toBe("Administração Geral");
      expect(updated.category).toBe("administration");
      expect(updated.code).toBe("ADM");
    });

    it("não altera o id nem o código", () => {
      const cc = CostCenter.create({ code: "ADM", name: "Administração", category: "administration" });
      const updated = cc.update({ name: "Outro Nome" });
      expect(updated.id).toBe(cc.id);
      expect(updated.code).toBe(cc.code);
    });
  });

  describe("activate / deactivate", () => {
    it("desactiva um centro de custo activo", () => {
      const cc = CostCenter.create({ code: "ADM", name: "Administração", category: "administration" });
      const deactivated = cc.deactivate();
      expect(deactivated.status).toBe("inactive");
    });

    it("activa um centro de custo inactivo", () => {
      const cc = CostCenter.create({ code: "ADM", name: "Administração", category: "administration" });
      const deactivated = cc.deactivate();
      const reactivated = deactivated.activate();
      expect(reactivated.status).toBe("active");
    });

    it("retorna nova instância sem mutar o original", () => {
      const cc = CostCenter.create({ code: "ADM", name: "Administração", category: "administration" });
      cc.deactivate();
      expect(cc.status).toBe("active");
    });
  });
});
