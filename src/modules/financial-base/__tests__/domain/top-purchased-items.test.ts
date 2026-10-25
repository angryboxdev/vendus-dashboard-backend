import { rankTopPurchasedItems } from "../../domain/services/top-purchased-items.js";
import type { SupplierPurchasedLine } from "../../domain/ports/out/supplier-invoice-stats.port.js";

function line(over: Partial<SupplierPurchasedLine>): SupplierPurchasedLine {
  return {
    invoiceDate: new Date("2026-06-01"),
    description: "Artigo",
    supplierItemCode: null,
    stockItemId: null,
    stockItemName: null,
    unitCostWithoutVat: 1,
    totalWithVat: 10,
    ...over,
  };
}

describe("rankTopPurchasedItems", () => {
  it("devolve lista vazia sem linhas", () => {
    expect(rankTopPurchasedItems([], 5)).toEqual([]);
  });

  it("agrupa por artigo de stock e ordena pelo total gasto", () => {
    const result = rankTopPurchasedItems(
      [
        line({ stockItemId: "s1", stockItemName: "Água 1L", totalWithVat: 20 }),
        line({ stockItemId: "s1", stockItemName: "Água 1L", totalWithVat: 30 }),
        line({ stockItemId: "s2", stockItemName: "Sumo 33cl", totalWithVat: 40 }),
      ],
      5,
    );
    expect(result.map((r) => [r.name, r.totalSpent, r.purchaseCount])).toEqual([
      ["Água 1L", 50, 2],
      ["Sumo 33cl", 40, 1],
    ]);
  });

  it("sem artigo de stock agrupa por código e depois por descrição normalizada", () => {
    const result = rankTopPurchasedItems(
      [
        line({ supplierItemCode: "AB1", description: "Caixa A" }),
        line({ supplierItemCode: "ab1 ", description: "Caixa A (nova)" }),
        line({ description: "  Guardanapos   brancos" }),
        line({ description: "guardanapos brancos" }),
      ],
      5,
    );
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.purchaseCount === 2)).toBe(true);
  });

  it("nome, código e preço vêm da compra mais recente", () => {
    const [item] = rankTopPurchasedItems(
      [
        line({ supplierItemCode: "X1", description: "Velho", invoiceDate: new Date("2026-08-10"), unitCostWithoutVat: 0.8 }),
        line({ supplierItemCode: "X1", description: "Novo", invoiceDate: new Date("2026-09-12"), unitCostWithoutVat: 0.89 }),
        line({ supplierItemCode: "X1", description: "Antigo", invoiceDate: new Date("2026-07-01"), unitCostWithoutVat: 0.7 }),
      ],
      5,
    );
    expect(item!.name).toBe("Novo");
    expect(item!.code).toBe("X1");
    expect(item!.lastUnitPrice).toBe(0.89);
    expect(item!.lastPurchaseDate).toEqual(new Date("2026-09-12"));
  });

  it("respeita o limite", () => {
    const lines = Array.from({ length: 8 }, (_, i) => line({ description: `Artigo ${i}`, totalWithVat: i }));
    const result = rankTopPurchasedItems(lines, 5);
    expect(result).toHaveLength(5);
    expect(result[0]!.name).toBe("Artigo 7");
  });
});
