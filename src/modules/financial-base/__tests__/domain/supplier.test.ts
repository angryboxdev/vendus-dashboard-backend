import { Supplier } from "../../domain/entities/supplier.js";

describe("Supplier", () => {
  describe("create", () => {
    it("cria um fornecedor com status active por defeito", () => {
      const s = Supplier.create({ name: "Aldeia Portugal" });
      expect(s.status).toBe("active");
      expect(s.id).toBeDefined();
    });

    it("faz trim ao nome", () => {
      const s = Supplier.create({ name: "  Makro  " });
      expect(s.name).toBe("Makro");
    });

    it("define campos opcionais como null quando não fornecidos", () => {
      const s = Supplier.create({ name: "Fornecedor" });
      expect(s.nif).toBeNull();
      expect(s.email).toBeNull();
      expect(s.iban).toBeNull();
      expect(s.defaultCostCenterId).toBeNull();
    });
  });

  describe("update", () => {
    it("actualiza apenas os campos fornecidos", () => {
      const s = Supplier.create({ name: "Aldeia Portugal", nif: "123456789" });
      const updated = s.update({ email: "info@aldeia.pt" });
      expect(updated.email).toBe("info@aldeia.pt");
      expect(updated.nif).toBe("123456789");
      expect(updated.name).toBe("Aldeia Portugal");
    });

    it("permite limpar campos opcionais com null explícito", () => {
      const s = Supplier.create({ name: "Fornecedor", nif: "123456789" });
      const updated = s.update({ nif: null });
      expect(updated.nif).toBeNull();
    });
  });

  describe("activate / deactivate", () => {
    it("desactiva um fornecedor activo", () => {
      const s = Supplier.create({ name: "Fornecedor" });
      const deactivated = s.deactivate();
      expect(deactivated.status).toBe("inactive");
    });

    it("retorna nova instância sem mutar o original", () => {
      const s = Supplier.create({ name: "Fornecedor" });
      s.deactivate();
      expect(s.status).toBe("active");
    });
  });
});
