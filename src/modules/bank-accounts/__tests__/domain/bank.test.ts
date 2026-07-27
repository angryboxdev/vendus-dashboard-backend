import { describe, it, expect } from "@jest/globals";
import { Bank } from "../../domain/entities/bank.js";

const BASE = {
  name: "Millennium BCP",
  logoKey: "millennium_bcp" as const,
  color: "#1A5276",
  country: "PT",
  statementFormat: "millennium_bcp_csv" as const,
};

describe("Bank entity", () => {
  it("creates a bank with valid props", () => {
    const bank = Bank.create(BASE);
    expect(bank.id).toBeDefined();
    expect(bank.name).toBe("Millennium BCP");
    expect(bank.country).toBe("PT");
    expect(bank.bic).toBeNull();
  });

  it("trims name and uppercases country", () => {
    const bank = Bank.create({ ...BASE, name: "  BCP  ", country: "pt" });
    expect(bank.name).toBe("BCP");
    expect(bank.country).toBe("PT");
  });

  it("stores optional BIC", () => {
    const bank = Bank.create({ ...BASE, bic: "BCOMPTPL" });
    expect(bank.bic).toBe("BCOMPTPL");
  });

  it("throws on empty name", () => {
    expect(() => Bank.create({ ...BASE, name: "   " })).toThrow("Bank name is required");
  });

  it("throws on invalid hex color", () => {
    expect(() => Bank.create({ ...BASE, color: "blue" })).toThrow("hex color");
    expect(() => Bank.create({ ...BASE, color: "#GGG" })).toThrow("hex color");
  });

  it("update returns new immutable instance", () => {
    const bank = Bank.create(BASE);
    const updated = bank.update({ name: "BCP Updated", color: "#000000" });
    expect(updated.name).toBe("BCP Updated");
    expect(bank.name).toBe("Millennium BCP"); // original unchanged
    expect(updated.id).toBe(bank.id);
  });

  it("update throws on empty name", () => {
    const bank = Bank.create(BASE);
    expect(() => bank.update({ name: "" })).toThrow("Bank name is required");
  });
});
