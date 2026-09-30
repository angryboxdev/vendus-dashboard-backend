import { StockReviewLine } from "../../domain/entities/stock-review-line.js";
import { InactiveStockItemReferencedError, InvalidConversionFactorError } from "../../domain/errors.js";

function baseProps() {
  return {
    organizationId: "org-1",
    reviewId: "review-1",
    invoiceLineId: "line-1",
    description: "Mozzarella Ralado",
    purchaseQuantity: 2,
    purchaseUnit: "un",
    unitCostWithoutVat: 10,
    totalWithVat: 24.6,
  };
}

describe("StockReviewLine.create", () => {
  it("começa sempre unresolved", () => {
    const line = StockReviewLine.create(baseProps());
    expect(line.resolutionType).toBe("unresolved");
  });
});

describe("StockReviewLine.resolveToStockItem", () => {
  it("calcula stockQuantity = purchaseQuantity × conversionFactor", () => {
    const line = StockReviewLine.create(baseProps());
    const resolved = line.resolveToStockItem(
      { stockItemId: "item-1", conversionFactor: 1000, isItemActive: true },
      false,
      "user@fonsat.pt",
    );
    expect(resolved.toProps().stockQuantity).toBe(2000);
    expect(resolved.resolutionType).toBe("existing_item");
  });

  it("new_item marca resolutionType new_item", () => {
    const line = StockReviewLine.create(baseProps());
    const resolved = line.resolveToStockItem({ stockItemId: "item-new", conversionFactor: 5000, isItemActive: true }, true, "user@fonsat.pt");
    expect(resolved.resolutionType).toBe("new_item");
  });

  it("rejeita fator de conversão não positivo", () => {
    const line = StockReviewLine.create(baseProps());
    expect(() => line.resolveToStockItem({ stockItemId: "item-1", conversionFactor: 0, isItemActive: true }, false, "u")).toThrow(
      InvalidConversionFactorError,
    );
    expect(() => line.resolveToStockItem({ stockItemId: "item-1", conversionFactor: -1, isItemActive: true }, false, "u")).toThrow(
      InvalidConversionFactorError,
    );
  });

  it("rejeita item inativo", () => {
    const line = StockReviewLine.create(baseProps());
    expect(() => line.resolveToStockItem({ stockItemId: "item-1", conversionFactor: 1000, isItemActive: false }, false, "u")).toThrow(
      InactiveStockItemReferencedError,
    );
  });
});

describe("StockReviewLine.resolveAsNoStockEffect", () => {
  it("marca no_stock_effect e limpa campos de stock", () => {
    const line = StockReviewLine.create(baseProps());
    const resolved = line.resolveAsNoStockEffect("user@fonsat.pt");
    expect(resolved.resolutionType).toBe("no_stock_effect");
    expect(resolved.stockItemId).toBeNull();
  });
});
