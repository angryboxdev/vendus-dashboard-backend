import { buildSupplierPlanningSummary, monthsAgo, priceUnitOf } from "../../domain/services/supplier-planning-summary.js";
import type { SupplierPlanningReadModel } from "../../domain/ports/out/supplier-planning-read.port.js";

const TODAY = new Date("2026-10-25T12:00:00Z");
const empty: SupplierPlanningReadModel = { invoices: [], lines: [], stockPurchases: [] };

describe("buildSupplierPlanningSummary", () => {
  it("sem dados: tudo a zero/vazio, sem frequência", () => {
    expect(buildSupplierPlanningSummary(empty, TODAY)).toEqual({
      associatedItems: 0, purchasesLast3Months: 0, purchaseFrequencyDays: null, invoicesLast12Months: 0, categories: [], items: [], defaultItemId: null,
    });
  });

  it("compras dos últimos 3 meses (s/ IVA) e frequência média entre faturas", () => {
    const s = buildSupplierPlanningSummary({
      ...empty,
      invoices: [
        { id: "a", date: "2026-05-01", netCents: 100000 }, // fora dos 3 meses
        { id: "b", date: "2026-08-01", netCents: 50000 },
        { id: "c", date: "2026-10-01", netCents: 25050 },
        { id: "d", date: "2026-10-01", netCents: 10000 }, // mesma data: conta uma vez para a frequência
      ],
    }, TODAY);
    expect(s.purchasesLast3Months).toBe(850.5);
    expect(s.purchaseFrequencyDays).toBe(76.5); // 153 dias / 2 intervalos
    expect(s.invoicesLast12Months).toBe(4);
  });

  it("subcategorias por valor: as 4 maiores + «Outros», em %", () => {
    const lines = [["c1", "Bebidas", 4100], ["c2", "Laticínios", 2400], ["c3", "Massas", 1500], ["c4", "Proteínas", 1200], ["c5", "Limpeza", 500], ["c6", "Gás", 300], [null, null, 0]] as const;
    const s = buildSupplierPlanningSummary({ ...empty, lines: lines.map(([categoryId, categoryName, netCents]) => ({ categoryId, categoryName, netCents })) }, TODAY);
    expect(s.categories).toEqual([
      { name: "Bebidas", amount: 41, pct: 41 },
      { name: "Laticínios", amount: 24, pct: 24 },
      { name: "Massas", amount: 15, pct: 15 },
      { name: "Proteínas", amount: 12, pct: 12 },
      { name: "Outros", amount: 8, pct: 8 },
    ]);
  });

  it("artigos: último preço por kg/l, média por mês, mais recente primeiro e o mais comprado no gráfico", () => {
    const s = buildSupplierPlanningSummary({
      ...empty,
      stockPurchases: [
        // Mozzarella: base em g, 0,58 cênt./g = 5,80 €/kg
        { stockItemId: "moz", itemName: "Mozzarella", baseUnit: "g", date: "2026-08-10", unitCostPerBaseUnitCents: 0.5 },
        { stockItemId: "moz", itemName: "Mozzarella", baseUnit: "g", date: "2026-08-20", unitCostPerBaseUnitCents: 0.54 },
        { stockItemId: "moz", itemName: "Mozzarella", baseUnit: "g", date: "2026-09-15", unitCostPerBaseUnitCents: 0.58 },
        // Azeite: base em ml → €/l
        { stockItemId: "az", itemName: "Azeite", baseUnit: "ml", date: "2026-09-18", unitCostPerBaseUnitCents: 0.62 },
      ],
    }, TODAY);
    expect(s.associatedItems).toBe(2);
    expect(s.defaultItemId).toBe("moz");
    expect(s.items.map((i) => [i.name, i.priceUnit, i.lastPurchaseDate, i.lastUnitPrice])).toEqual([
      ["Azeite", "l", "2026-09-18", 6.2],
      ["Mozzarella", "kg", "2026-09-15", 5.8],
    ]);
    expect(s.items[1]!.monthly).toEqual([{ month: "2026-08", avgUnitPrice: 5.2 }, { month: "2026-09", avgUnitPrice: 5.8 }]);
  });
});

describe("auxiliares", () => {
  it("monthsAgo e unidade de preço", () => {
    expect(monthsAgo(TODAY, 3)).toBe("2026-07-25");
    expect(priceUnitOf("g")).toEqual({ label: "kg", factor: 1000 });
    expect(priceUnitOf("un")).toEqual({ label: "un", factor: 1 });
  });
});
