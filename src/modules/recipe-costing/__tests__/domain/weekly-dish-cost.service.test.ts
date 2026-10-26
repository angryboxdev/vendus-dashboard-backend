import type { PurchaseObservation } from "../../domain/entities/price-history.js";
import type { IngredientInfo, PreparationVersion, RecipeVersion } from "../../domain/entities/weekly-dish-cost.js";
import { weeklyPriceHistory } from "../../domain/services/price-history.service.js";
import { weeklyDishCost } from "../../domain/services/weekly-dish-cost.service.js";

const TODAY = "2026-10-21"; // semana 2026-W43
const obs = (date: string, quantity: number, netCents: number): PurchaseObservation => ({
  lineId: `${date}-${quantity}`, supplierName: "Fornecedor Exemplo", invoiceNumber: "FT 1", invoiceDate: date, quantity, grossCents: null, discountCents: null, netCents,
});
const ingredient = (name: string, observations: PurchaseObservation[], manualCentsPerUnit: number | null = null, weeks = 3): IngredientInfo => ({
  name, baseUnit: "g", manualCentsPerUnit, weeks: weeklyPriceHistory(observations, TODAY, weeks),
});
const line = (over: Partial<RecipeVersion["lines"][number]>) => ({ stockItemId: null, preparationId: null, size: "small", quantity: 0, wasteFactor: null, ...over });

describe("custo teórico semanal da pizza (V5 §6)", () => {
  test("exemplo da task: 100 g de cheddar a 0,00779 €/g = 0,779 € (W41 a W43, preço transportado nas semanas sem compra)", () => {
    const r = weeklyDishCost({
      pizzaId: "p", name: "Teste", today: TODAY, weeks: 3,
      versions: [{ effectiveFrom: "2026-10-01T00:00:00.000Z", lines: [line({ stockItemId: "ch", quantity: 100 })] }],
      preparations: new Map(),
      ingredients: new Map([["ch", ingredient("Cheddar", [obs("2026-10-05", 6000, 4674)])]]),
    });
    const weeks = r.sizes[0]!.weeks;
    expect(weeks.map((w) => [w.week, w.status, w.costWithoutVat, w.lines[0]!.source])).toEqual([
      ["2026-W41", "ok", 0.779, "purchase"],
      ["2026-W42", "ok", 0.779, "carried"],
      ["2026-W43", "ok", 0.779, "carried"],
    ]);
    expect(weeks[2]!.partial).toBe(true);
  });

  test("T17: 0,01 g multiplica com precisão antes do arredondamento final", () => {
    const r = weeklyDishCost({
      pizzaId: "p", name: "Teste", today: TODAY, weeks: 1,
      versions: [{ effectiveFrom: "2026-10-01T00:00:00.000Z", lines: [line({ stockItemId: "sal", quantity: 0.01 }), line({ stockItemId: "ch", quantity: 100 })] }],
      preparations: new Map(),
      ingredients: new Map([
        ["sal", ingredient("Especiaria", [obs("2026-10-20", 1000, 4200)], null, 1)], // 4,20 €/g
        ["ch", ingredient("Cheddar", [obs("2026-10-20", 6000, 4674)], null, 1)],
      ]),
    });
    // 0,01 g × 0,042 €/g = 0,00042 € (somado sem arredondar) + 0,779 € = 0,77942 → 0,7794
    expect(r.sizes[0]!.weeks[0]!.costWithoutVat).toBe(0.7794);
    expect(r.sizes[0]!.weeks[0]!.lines[0]!.costWithoutVat).toBe(0.0004);
  });

  test("T18: a receita mudou na W42 → W41 usa a versão antiga; antes da 1.ª versão «sem versão histórica»", () => {
    const versions: RecipeVersion[] = [
      { effectiveFrom: "2026-10-07T10:00:00.000Z", lines: [line({ stockItemId: "ch", quantity: 100 })] },
      { effectiveFrom: "2026-10-14T10:00:00.000Z", lines: [line({ stockItemId: "ch", quantity: 120 })] },
    ];
    const r = weeklyDishCost({
      pizzaId: "p", name: "Teste", today: TODAY, weeks: 4, versions, preparations: new Map(),
      ingredients: new Map([["ch", ingredient("Cheddar", [obs("2026-10-05", 1000, 779)], null, 4)]]),
    });
    expect(r.sizes[0]!.weeks.map((w) => [w.week, w.status, w.costWithoutVat])).toEqual([
      ["2026-W40", "no_version", null],
      ["2026-W41", "ok", 0.779],
      ["2026-W42", "ok", 0.9348],
      ["2026-W43", "ok", 0.9348],
    ]);
    expect(r.sizes[0]!.weeks[2]!.changeRatio).toBeCloseTo(0.2, 6);
    expect(r.firstVersionAt).toBe("2026-10-07T10:00:00.000Z");
  });

  test("T19: ingrediente sem preço → semana incompleta, a parcela em falta não conta como zero «completo»; sem compras usa o manual assinalado", () => {
    const r = weeklyDishCost({
      pizzaId: "p", name: "Teste", today: TODAY, weeks: 1,
      versions: [{ effectiveFrom: "2026-10-01T00:00:00.000Z", lines: [line({ stockItemId: "ch", quantity: 100 }), line({ stockItemId: "novo", quantity: 10 }), line({ stockItemId: "oregaos", quantity: 1 })] }],
      preparations: new Map(),
      ingredients: new Map([
        ["ch", ingredient("Cheddar", [obs("2026-10-20", 1000, 779)], null, 1)],
        ["novo", ingredient("Sem preço", [], null, 1)],
        ["oregaos", ingredient("Orégãos", [], 2, 1)], // manual 0,02 €/g
      ]),
    });
    const w = r.sizes[0]!.weeks[0]!;
    expect(w.status).toBe("incomplete");
    expect(w.lines.map((l) => [l.name, l.source, l.complete])).toEqual([["Cheddar", "purchase", true], ["Sem preço", "none", false], ["Orégãos", "manual", true]]);
    expect(w.changeRatio).toBeNull();
  });

  test("preparo com versão própria: rendimento e quantidades da semana; a pior origem dos ingredientes", () => {
    const prep: PreparationVersion[] = [
      { effectiveFrom: "2026-10-01T00:00:00.000Z", definition: { id: "mix", name: "Mix de Queijos", yieldQty: 2800, useAsUnit: false, items: [{ stockItemId: "mozz", quantity: 2500 }, { stockItemId: "ch", quantity: 300 }] } },
    ];
    const r = weeklyDishCost({
      pizzaId: "p", name: "Teste", today: TODAY, weeks: 1,
      versions: [{ effectiveFrom: "2026-10-01T00:00:00.000Z", lines: [line({ preparationId: "mix", quantity: 100 })] }],
      preparations: new Map([["mix", prep]]),
      ingredients: new Map([
        ["mozz", ingredient("Mozzarella", [obs("2026-10-20", 40000, 22320)], null, 1)],
        ["ch", ingredient("Cheddar", [obs("2026-10-05", 6000, 4674)], null, 1)], // compra antes da janela → transportado
      ]),
    });
    const l = r.sizes[0]!.weeks[0]!.lines[0]!;
    // 100/2800 × (2500 × 0,00558 + 300 × 0,00779) = 0,5817
    expect([l.name, l.costWithoutVat, l.source, l.complete]).toEqual(["Mix de Queijos", 0.5817, "carried", true]);
  });
});

describe("GetDishWeeklyCostUseCase", () => {
  test("pizza de outra empresa/inexistente → null; junta versões, preparos, artigos e compras", async () => {
    const { GetDishWeeklyCostUseCase } = await import("../../application/use-cases/get-dish-weekly-cost.use-case.js");
    const { mintOrganizationId } = await import("../../../../kernel/organization-id.js");
    const read = {
      findPizza: async (_o: unknown, id: string) => (id === "marg" ? { id, name: "Margherita" } : null),
      listPizzaVersions: async () => [{ effectiveFrom: "2026-10-01T00:00:00.000Z", lines: [line({ stockItemId: "ch", quantity: 100 })] }],
      listPreparationVersions: async () => new Map(),
      listIngredients: async () => new Map([["ch", { name: "Cheddar", baseUnit: "g", manualCentsPerUnit: null }]]),
    };
    const purchases = { findItem: async () => null, listForItem: async () => [obs("2026-10-20", 1000, 779)] };
    const uc = new GetDishWeeklyCostUseCase(read as never, purchases as never, () => TODAY);
    const org = mintOrganizationId("org-test");
    expect(await uc.execute({ organizationId: org, pizzaId: "outra" })).toBeNull();
    const r = (await uc.execute({ organizationId: org, pizzaId: "marg", weeks: 2 }))!;
    // W42: ainda sem compra nem preço manual → incompleta; W43: compra da semana.
    expect(r.sizes[0]!.weeks.map((w) => [w.week, w.status, w.lines[0]!.source])).toEqual([["2026-W42", "incomplete", "none"], ["2026-W43", "ok", "purchase"]]);
    expect(r.sizes[0]!.weeks[1]!.costWithoutVat).toBe(0.779);
  });
});
