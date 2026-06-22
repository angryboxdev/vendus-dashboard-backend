import { CostCenterGroup } from "../../domain/entities/cost-center-group.js";

describe("CostCenterGroup", () => {
  describe("create", () => {
    it("cria um grupo com valores padrão corretos", () => {
      const group = CostCenterGroup.create({ code: "opd", name: "Operação Direta" });

      expect(group.code).toBe("OPD");
      expect(group.name).toBe("Operação Direta");
      expect(group.isActive).toBe(true);
      expect(group.sortOrder).toBe(0);
      expect(group.description).toBeNull();
      expect(typeof group.id).toBe("string");
    });

    it("normaliza o código para maiúsculas e faz trim", () => {
      const group = CostCenterGroup.create({ code: "  pes  ", name: "Pessoal" });
      expect(group.code).toBe("PES");
    });

    it("faz trim do nome", () => {
      const group = CostCenterGroup.create({ code: "ADM", name: "  Administrativo  " });
      expect(group.name).toBe("Administrativo");
    });
  });

  describe("update", () => {
    it("actualiza os campos editáveis e gera nova instância", () => {
      const original = CostCenterGroup.create({ code: "OPD", name: "Operação" });
      const updated = original.update({ name: "Operação Direta", sortOrder: 1 });

      expect(updated.name).toBe("Operação Direta");
      expect(updated.sortOrder).toBe(1);
      expect(updated.id).toBe(original.id);
      expect(updated.code).toBe(original.code);
      expect(original.name).toBe("Operação");
    });

    it("não altera campos não passados no update", () => {
      const original = CostCenterGroup.create({
        code: "OPD",
        name: "Operação",
        description: "Desc original",
        sortOrder: 5,
      });
      const updated = original.update({ name: "Novo nome" });

      expect(updated.description).toBe("Desc original");
      expect(updated.sortOrder).toBe(5);
    });
  });

  describe("activate / deactivate", () => {
    it("deactivate devolve grupo inativo", () => {
      const group = CostCenterGroup.create({ code: "OPD", name: "Operação" });
      const inactive = group.deactivate();

      expect(inactive.isActive).toBe(false);
      expect(group.isActive).toBe(true);
    });

    it("activate devolve grupo ativo", () => {
      const group = CostCenterGroup.create({ code: "OPD", name: "Operação" }).deactivate();
      const active = group.activate();

      expect(active.isActive).toBe(true);
    });
  });
});
