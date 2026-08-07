import { normalizeProductTitle } from "../../domain/services/product-title-normalizer.js";

describe("normalizeProductTitle", () => {
  it("replaces (Individual) with S", () => {
    expect(normalizeProductTitle("Honey Peperoni (Individual)")).toBe("Honey Peperoni S");
  });

  it("replaces (Grande) with L", () => {
    expect(normalizeProductTitle("Chicken & Cheese (Grande)")).toBe("Chicken & Cheese L");
  });

  it("works with special characters in the title", () => {
    expect(normalizeProductTitle("4 Formaggios+ (Individual)")).toBe("4 Formaggios+ S");
  });

  it("is case-insensitive", () => {
    expect(normalizeProductTitle("Honey Peperoni (GRANDE)")).toBe("Honey Peperoni L");
    expect(normalizeProductTitle("Honey Peperoni (individual)")).toBe("Honey Peperoni S");
  });

  it("leaves titles without size suffix unchanged", () => {
    expect(normalizeProductTitle("Coca Cola 33cl")).toBe("Coca Cola 33cl");
  });

  it("trims trailing whitespace before the suffix", () => {
    expect(normalizeProductTitle("Truffle Shrooms  (Individual)")).toBe("Truffle Shrooms S");
  });

  it("returns the title unchanged when no size suffix is present", () => {
    expect(normalizeProductTitle("Embalagem Take-Away")).toBe("Embalagem Take-Away");
  });
});
