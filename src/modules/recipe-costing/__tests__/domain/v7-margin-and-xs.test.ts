import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { computeDishMargin, DEFAULT_SALES_VAT_RATE } from "../../domain/services/dish-margin.service.js";
import { computeRecipeCosting } from "../../domain/services/recipe-cost.service.js";
import { GetMenuCostingSettingsUseCase, SaveMenuCostingSettingsUseCase } from "../../application/use-cases/menu-costing-settings.use-cases.js";
import { GetRecipeCostingUseCase } from "../../application/use-cases/get-recipe-costing.use-case.js";
import { InvalidMenuCostingSettingsError } from "../../domain/ports/in/menu-costing-settings.port.js";
import type { RecipeCostingSnapshot } from "../../domain/entities/recipe-costing.js";
import { FakeMenuCostingSettings } from "../fakes/fake-menu-costing-settings.js";
import { FakeRecipeCostingRead } from "../fakes/fake-recipe-costing-read.js";

const ORG = mintOrganizationId("org-test");

// Dados fictícios.
const snapshot: RecipeCostingSnapshot = {
  ingredients: [
    { stockItemId: "farinha", name: "Farinha", baseUnit: "g", unitCostWithoutVat: 0.002, source: "invoice" },
    { stockItemId: "creme", name: "Creme doce", baseUnit: "g", unitCostWithoutVat: 0.01, source: "manual" },
  ],
  preparations: [{ id: "vazia", name: "Molho sem receita", yieldQty: 0.001, useAsUnit: false, items: [] }],
  dishes: [
    {
      pizzaId: "doce", name: "Doce de teste", category: "sweeties", isActive: true,
      prices: [{ size: "large", price: 14.9 }, { size: "small", price: 8.9 }, { size: "xs", price: 5.9 }],
      lines: [
        { stockItemId: "farinha", preparationId: null, size: "large", quantity: 200, wasteFactor: null },
        { stockItemId: "creme", preparationId: null, size: "large", quantity: 140, wasteFactor: null },
        { stockItemId: "farinha", preparationId: null, size: "small", quantity: 100, wasteFactor: null },
        { stockItemId: "creme", preparationId: null, size: "small", quantity: 70, wasteFactor: null },
        { stockItemId: "farinha", preparationId: null, size: "xs", quantity: 50, wasteFactor: null },
        { stockItemId: "creme", preparationId: null, size: "xs", quantity: 35, wasteFactor: null },
      ],
    },
    {
      pizzaId: "ranch", name: "Com preparação vazia", category: "classics", isActive: true,
      prices: [{ size: "small", price: 10 }],
      lines: [
        { stockItemId: "farinha", preparationId: null, size: "small", quantity: 100, wasteFactor: null },
        { stockItemId: null, preparationId: "vazia", size: "small", quantity: 25, wasteFactor: null },
      ],
    },
  ],
};

describe("margem teórica dos pratos (V7)", () => {
  it("PVP com IVA → sem IVA à taxa da empresa; margem, % e CMV", () => {
    // 11,30 € com 13% → 10,00 € sem IVA; custo 3 € → margem 7 €, 70%, CMV 30%.
    expect(computeDishMargin({ costWithoutVat: 3, complete: true, salePrice: 11.3, salesVatRate: 13 })).toEqual({
      netSalePrice: 10, marginWithoutVat: 7, marginRatio: 0.7, foodCostRatio: 0.3,
    });
  });

  it("sem margem com custo parcial, sem PVP ou PVP 0", () => {
    expect(computeDishMargin({ costWithoutVat: 3, complete: false, salePrice: 11.3, salesVatRate: 13 })).toBeNull();
    expect(computeDishMargin({ costWithoutVat: 3, complete: true, salePrice: null, salesVatRate: 13 })).toBeNull();
    expect(computeDishMargin({ costWithoutVat: 3, complete: true, salePrice: 0, salesVatRate: 13 })).toBeNull();
  });

  it("XS antes de Pequena e Grande; XS = metade da pequena dá metade do custo; margem por tamanho", () => {
    const report = computeRecipeCosting(snapshot, 13);
    const doce = report.dishes.find((d) => d.pizzaId === "doce")!;
    expect(doce.sizes.map((s) => s.size)).toEqual(["xs", "small", "large"]);
    const [xs, small] = doce.sizes;
    expect(small!.costWithoutVat).toBe(0.9);
    expect(xs!.costWithoutVat).toBe(0.45);
    expect(xs!.margin!.netSalePrice).toBeCloseTo(5.9 / 1.13, 4);
    expect(xs!.margin!.marginWithoutVat).toBeCloseTo(5.9 / 1.13 - 0.45, 4);
    expect(report.salesVatRate).toBe(13);
  });

  it("preparação sem componentes deixa o custo parcial e sem margem", () => {
    const ranch = computeRecipeCosting(snapshot).dishes.find((d) => d.pizzaId === "ranch")!.sizes[0]!;
    expect(ranch.complete).toBe(false);
    expect(ranch.margin).toBeNull();
  });

  it("a taxa por omissão é 13% quando a empresa não definiu", async () => {
    const reader = new FakeRecipeCostingRead();
    reader.snapshot = snapshot;
    const settings = new FakeMenuCostingSettings();
    const report = await new GetRecipeCostingUseCase(reader, settings).execute({ organizationId: ORG });
    expect(report.salesVatRate).toBe(DEFAULT_SALES_VAT_RATE);
    settings.rate = 23;
    expect((await new GetRecipeCostingUseCase(reader, settings).execute({ organizationId: ORG })).salesVatRate).toBe(23);
  });
});

describe("definições das Fichas técnicas (V7)", () => {
  it("ler devolve a predefinição; gravar arredonda e regista o autor", async () => {
    const repo = new FakeMenuCostingSettings();
    expect(await new GetMenuCostingSettingsUseCase(repo).execute({ organizationId: ORG })).toEqual({ salesVatRate: 13, isDefault: true });
    expect(await new SaveMenuCostingSettingsUseCase(repo).execute({ organizationId: ORG, actor: "gestor@exemplo.invalid", salesVatRate: 6.004 })).toEqual({ salesVatRate: 6, isDefault: false });
    expect(repo.saved).toEqual([{ organizationId: ORG, rate: 6, actor: "gestor@exemplo.invalid" }]);
  });

  it("recusa taxas fora de 0–100 ou não numéricas", async () => {
    const save = new SaveMenuCostingSettingsUseCase(new FakeMenuCostingSettings());
    for (const bad of [-1, 101, Number.NaN]) {
      await expect(save.execute({ organizationId: ORG, actor: "x", salesVatRate: bad })).rejects.toBeInstanceOf(InvalidMenuCostingSettingsError);
    }
  });
});

describe("custo do lote das preparações no relatório (V7)", () => {
  it("lote = soma dos ingredientes; sem ingredientes fica incompleto", () => {
    const report = computeRecipeCosting({
      ...snapshot,
      preparations: [...snapshot.preparations, { id: "massa", name: "Massa", yieldQty: 214, useAsUnit: true, items: [{ stockItemId: "farinha", quantity: 130 }] }],
    });
    expect(report.preparations).toEqual([
      { preparationId: "massa", name: "Massa", yieldQty: 214, useAsUnit: true, itemCount: 1, batchCostWithoutVat: 0.26, complete: true },
      { preparationId: "vazia", name: "Molho sem receita", yieldQty: 0.001, useAsUnit: false, itemCount: 0, batchCostWithoutVat: 0, complete: false },
    ]);
  });
});

describe("prato só com PVP, ainda sem composição (V7)", () => {
  it("não é completo nem tem margem (nunca 100%)", () => {
    const report = computeRecipeCosting({
      ...snapshot,
      dishes: [{ pizzaId: "novo", name: "Prato novo", category: "sweeties", isActive: true, prices: [{ size: "xs", price: 5.9 }, { size: "small", price: 8.5 }], lines: [] }],
    });
    for (const s of report.dishes[0]!.sizes) {
      expect(s.complete).toBe(false);
      expect(s.margin).toBeNull();
    }
  });
});
