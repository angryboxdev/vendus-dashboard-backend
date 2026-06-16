import { InvoiceLine } from "../../domain/entities/invoice-line.js";

const base = {
  invoiceId: "inv-1",
  description: "Fornecimento farinha",
  quantity: 50,
  unitCostWithoutVat: 100,
  vatRate: 6,
  vatAmount: 300,
  totalWithVat: 5300,
};

describe("InvoiceLine entity", () => {
  it("creates with default type 'other' and null cc", () => {
    const line = InvoiceLine.create(base);
    expect(line.type).toBe("other");
    expect(line.costCenterId).toBeNull();
    expect(line.stockEntryId).toBeNull();
    expect(line.id).toBeDefined();
  });

  it("trims description", () => {
    const line = InvoiceLine.create({ ...base, description: "  Farinha T55  " });
    expect(line.description).toBe("Farinha T55");
  });

  it("classify returns new instance with updated fields", () => {
    const line = InvoiceLine.create(base);
    const classified = line.classify({
      type: "stock_purchase",
      costCenterId: "cc-ope",
      category: "Ingredientes",
    });
    expect(classified.type).toBe("stock_purchase");
    expect(classified.costCenterId).toBe("cc-ope");
    expect(classified.category).toBe("Ingredientes");
    // immutability
    expect(line.type).toBe("other");
    expect(line.costCenterId).toBeNull();
  });

  it("classify preserves unspecified fields", () => {
    const line = InvoiceLine.create({ ...base, costCenterId: "cc-existing" });
    const classified = line.classify({ type: "fixed_cost" });
    expect(classified.type).toBe("fixed_cost");
    expect(classified.costCenterId).toBe("cc-existing");
  });

  it("classify allows clearing nullable fields with null", () => {
    const line = InvoiceLine.create({ ...base, costCenterId: "cc-1" });
    const cleared = line.classify({ costCenterId: null });
    expect(cleared.costCenterId).toBeNull();
  });

  it("setStockEntry returns new instance with stockEntryId", () => {
    const line = InvoiceLine.create(base);
    const withEntry = line.setStockEntry("entry-42");
    expect(withEntry.stockEntryId).toBe("entry-42");
    expect(line.stockEntryId).toBeNull();
  });
});
