import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import type { PurchaseObservation } from "../../domain/entities/price-history.js";
import { isoWeek, weeklyPriceHistory } from "../../domain/services/price-history.service.js";
import { GetIngredientPriceHistoryUseCase } from "../../application/use-cases/get-ingredient-price-history.use-case.js";
import type { PurchaseObservationReadPort } from "../../domain/ports/out/purchase-observation-read.port.js";

const obs = (over: Partial<PurchaseObservation>): PurchaseObservation => ({
  lineId: "l", supplierName: "Fornecedor Exemplo", invoiceNumber: "FT 1", invoiceDate: "2026-10-05", quantity: 1000, grossCents: null, discountCents: null, netCents: 0, ...over,
});

describe("histórico semanal do preço de compra (V5 §5)", () => {
  test("semana ISO 8601: 05/10/2026 é 2026-W41 (segunda 05/10); 01/01/2027 ainda é 2026-W53", () => {
    expect(isoWeek("2026-10-05")).toEqual({ week: "2026-W41", weekStart: "2026-10-05" });
    expect(isoWeek("2026-10-11")).toEqual({ week: "2026-W41", weekStart: "2026-10-05" });
    expect(isoWeek("2027-01-01")).toEqual({ week: "2026-W53", weekStart: "2026-12-28" });
  });

  test("T13: duas compras na mesma semana → média PONDERADA (10 kg a 5 €/kg + 5 kg a 7 €/kg = 5,6667 €/kg), nunca a simples (6)", () => {
    const [w] = weeklyPriceHistory([
      obs({ lineId: "a", quantity: 10000, netCents: 5000 }),
      obs({ lineId: "b", invoiceDate: "2026-10-08", quantity: 5000, netCents: 3500 }),
    ], "2026-10-08", 1);
    expect(w).toMatchObject({ week: "2026-W41", quantity: 15000, netCents: 8500, partial: true });
    expect(w!.avgCentsPerUnit! * 1000).toBeCloseTo(566.6667, 3); // cêntimos/kg
    expect(w!.observations.map((o) => o.lineId)).toEqual(["a", "b"]);
  });

  test("T14: semana sem compra → «sem nova compra», preço anterior só como referência transportada; variação face à última compra", () => {
    const series = weeklyPriceHistory([
      obs({ lineId: "w39", invoiceDate: "2026-09-21", quantity: 1000, netCents: 558 }),
      obs({ lineId: "w41", invoiceDate: "2026-10-06", quantity: 1000, netCents: 600 }),
    ], "2026-10-14", 4);
    expect(series.map((w) => [w.week, w.quantity, w.avgCentsPerUnit, w.carriedCentsPerUnit, w.carriedFromWeek])).toEqual([
      ["2026-W39", 1000, 0.558, null, null],
      ["2026-W40", 0, null, 0.558, "2026-W39"],
      ["2026-W41", 1000, 0.6, null, null],
      ["2026-W42", 0, null, 0.6, "2026-W41"],
    ]);
    expect(series[2]!.changeRatio).toBeCloseTo(0.6 / 0.558 - 1, 6);
    expect(series[3]!.partial).toBe(true);
  });

  test("sem nenhuma compra: custo indisponível (null), nunca zero", () => {
    expect(weeklyPriceHistory([], "2026-10-14", 2).every((w) => w.avgCentsPerUnit === null && w.carriedCentsPerUnit === null)).toBe(true);
  });

  test("use case: artigo de outra empresa/inexistente → null; última compra com o preço por unidade base", async () => {
    const ORG = mintOrganizationId("org-test");
    const read: PurchaseObservationReadPort = {
      findItem: async (_o, id) => (id === "cheddar" ? { id, name: "Cheddar Ralado", baseUnit: "g" } : null),
      listForItem: async () => [obs({ lineId: "a", quantity: 6000, netCents: 4674 }), obs({ lineId: "b", quantity: 1000, netCents: 779 })],
    };
    const uc = new GetIngredientPriceHistoryUseCase(read, () => "2026-10-08");
    expect(await uc.execute({ organizationId: ORG, stockItemId: "outro" })).toBeNull();
    const h = (await uc.execute({ organizationId: ORG, stockItemId: "cheddar", weeks: 2 }))!;
    expect(h.weeks).toHaveLength(2);
    expect(h.weeks[1]!.avgCentsPerUnit).toBeCloseTo(0.779, 6); // 7,79 €/kg
    expect(h.lastPurchase).toMatchObject({ invoiceDate: "2026-10-05", supplierName: "Fornecedor Exemplo" });
  });
});
