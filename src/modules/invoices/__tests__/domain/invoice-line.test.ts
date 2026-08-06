import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { ChannelRequiredError } from "../../domain/errors.js";

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
    expect(line.costCenterCategoryId).toBeNull();
    expect(line.stockEntryId).toBeNull();
    expect(line.id).toBeDefined();
  });

  it("persists costCenterCategoryId when provided", () => {
    const line = InvoiceLine.create({ ...base, costCenterCategoryId: "cat-cmv" });
    expect(line.costCenterCategoryId).toBe("cat-cmv");
  });

  it("trims description", () => {
    const line = InvoiceLine.create({ ...base, description: "  Farinha T55  " });
    expect(line.description).toBe("Farinha T55");
  });

  it("classify sets type and returns new immutable instance", () => {
    const line = InvoiceLine.create(base);
    const classified = line.classify({ type: "stock_purchase" });
    expect(classified.type).toBe("stock_purchase");
    // immutability
    expect(line.type).toBe("other");
  });

  it("classify sets costCenterCategoryId", () => {
    const line = InvoiceLine.create(base);
    const classified = line.classify({ costCenterCategoryId: "cat-cmv" });
    expect(classified.costCenterCategoryId).toBe("cat-cmv");
    expect(line.costCenterCategoryId).toBeNull();
  });

  it("classify allows clearing costCenterCategoryId with null", () => {
    const line = InvoiceLine.create({ ...base, costCenterCategoryId: "cat-cmv" });
    const cleared = line.classify({ costCenterCategoryId: null });
    expect(cleared.costCenterCategoryId).toBeNull();
  });

  it("classify preserves unspecified fields", () => {
    const line = InvoiceLine.create({ ...base, costCenterCategoryId: "cat-existing" });
    const classified = line.classify({ type: "fixed_cost" });
    expect(classified.type).toBe("fixed_cost");
    expect(classified.costCenterCategoryId).toBe("cat-existing");
  });

  it("setStockEntry returns new instance with stockEntryId", () => {
    const line = InvoiceLine.create(base);
    const withEntry = line.setStockEntry("entry-42");
    expect(withEntry.stockEntryId).toBe("entry-42");
    expect(line.stockEntryId).toBeNull();
  });

  it("cria com financialType null e flags de canal false por omissão", () => {
    const line = InvoiceLine.create(base);
    expect(line.financialType).toBeNull();
    expect(line.channelId).toBeNull();
    expect(line.requiresChannel).toBe(false);
    expect(line.requiresAllocation).toBe(false);
    expect(line.aiSuggestedCategoryId).toBeNull();
    expect(line.aiConfidence).toBeNull();
  });
});

describe("InvoiceLine.classifyFromCategory", () => {
  const baseLine = {
    invoiceId: "inv-1",
    description: "Taxa de Serviço",
    quantity: 1,
    unitCostWithoutVat: 3000,
    vatRate: 23,
    vatAmount: 690,
    totalWithVat: 3690,
  };

  const category = {
    id: "cat-opd04",
    financialType: "variable_cost",
    affectsDre: true,
    affectsCashflow: true,
    affectsProfitability: true,
    requiresChannel: false,
    requiresAllocation: false,
  };

  it("herda costCenterCategoryId, financialType e todas as flags da subcategoria", () => {
    const line = InvoiceLine.create(baseLine);
    const result = line.classifyFromCategory(category);
    expect(result.costCenterCategoryId).toBe("cat-opd04");
    expect(result.financialType).toBe("variable_cost");
    expect(result.affectsDre).toBe(true);
    expect(result.affectsCashflow).toBe(true);
    expect(result.affectsProfitability).toBe(true);
    expect(result.requiresChannel).toBe(false);
    expect(result.requiresAllocation).toBe(false);
  });

  it("define channelId quando fornecido", () => {
    const line = InvoiceLine.create(baseLine);
    const result = line.classifyFromCategory(category, "ch-uber");
    expect(result.channelId).toBe("ch-uber");
  });

  it("mantém channelId como null quando não fornecido", () => {
    const line = InvoiceLine.create(baseLine);
    const result = line.classifyFromCategory(category);
    expect(result.channelId).toBeNull();
  });

  it("lança ChannelRequiredError quando requiresChannel=true e channelId omitido", () => {
    const cat = { ...category, requiresChannel: true };
    const line = InvoiceLine.create(baseLine);
    expect(() => line.classifyFromCategory(cat)).toThrow(ChannelRequiredError);
  });

  it("lança ChannelRequiredError quando requiresChannel=true e channelId é null", () => {
    const cat = { ...category, requiresChannel: true };
    const line = InvoiceLine.create(baseLine);
    expect(() => line.classifyFromCategory(cat, null)).toThrow(ChannelRequiredError);
  });

  it("não lança quando requiresChannel=true e channelId é fornecido", () => {
    const cat = { ...category, requiresChannel: true };
    const line = InvoiceLine.create(baseLine);
    expect(() => line.classifyFromCategory(cat, "ch-uber")).not.toThrow();
  });

  it("herda requiresAllocation quando true", () => {
    const cat = { ...category, requiresAllocation: true };
    const line = InvoiceLine.create(baseLine);
    const result = line.classifyFromCategory(cat);
    expect(result.requiresAllocation).toBe(true);
  });

  it("é imutável — a linha original não é modificada", () => {
    const line = InvoiceLine.create(baseLine);
    line.classifyFromCategory(category);
    expect(line.financialType).toBeNull();
    expect(line.costCenterCategoryId).toBeNull();
    expect(line.requiresChannel).toBe(false);
  });

  it("recalcula todos os campos herdados ao trocar de subcategoria", () => {
    const catA = { ...category, id: "cat-a", financialType: "cmv", affectsProfitability: false };
    const catB = { ...category, id: "cat-b", financialType: "marketing", affectsProfitability: true };
    const line = InvoiceLine.create(baseLine);
    const afterA = line.classifyFromCategory(catA);
    const afterB = afterA.classifyFromCategory(catB);
    expect(afterB.costCenterCategoryId).toBe("cat-b");
    expect(afterB.financialType).toBe("marketing");
    expect(afterB.affectsProfitability).toBe(true);
  });
});
