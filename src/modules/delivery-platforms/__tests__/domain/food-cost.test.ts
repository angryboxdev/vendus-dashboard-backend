import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { SaveProductMappingsUseCase } from "../../application/use-cases/food-cost.use-case.js";
import type { DishCostOption, ItemCostOption, ProductMapping } from "../../domain/entities/food-cost.js";
import type { SoldProduct } from "../../domain/entities/platform-statement.js";
import { InvalidProductMappingError } from "../../domain/errors.js";
import type { ProductMappingRepositoryPort } from "../../domain/ports/out/product-mapping-repository.port.js";
import type { StoredPlatformStatement } from "../../domain/ports/out/platform-statement-repository.port.js";
import { computeFoodCost, productKey, suggestTarget } from "../../domain/services/food-cost.service.js";
import { buildMarginReport } from "../../domain/services/margin-report.service.js";

const dishes: DishCostOption[] = [
  { pizzaId: "p1", name: "Honey Peperoni", sizes: [{ size: "small", costCents: 200, complete: true }, { size: "large", costCents: 350, complete: true }] },
  { pizzaId: "p2", name: "Tomate & Pesto", sizes: [{ size: "small", costCents: 100, complete: true }, { size: "large", costCents: 150, complete: true }] },
  { pizzaId: "p3", name: "Brigadeiro", sizes: [{ size: "xs", costCents: 30, complete: true }, { size: "small", costCents: 60, complete: true }] },
];
const items: ItemCostOption[] = [
  { stockItemId: "i1", name: "Coca Cola Zero 33cl", baseUnit: "un", unitCostCents: 65 },
  { stockItemId: "i2", name: "Coca Cola 33cl", baseUnit: "un", unitCostCents: 70 },
  { stockItemId: "b1", name: "Caixa S", baseUnit: "un", unitCostCents: 40 },
  { stockItemId: "b2", name: "Caixa L", baseUnit: "un", unitCostCents: 60 },
  { stockItemId: "b3", name: "Sacolas Delivery", baseUnit: "un", unitCostCents: 28 },
  { stockItemId: "b4", name: "Guardanapo Delivery", baseUnit: "un", unitCostCents: 2 },
];

const product = (description: string, quantity: number, netCents: number, date = "2026-09-10"): SoldProduct => ({ date, code: "W1", description, quantity, netCents });
const saft = (products: SoldProduct[], ordersCount: number): StoredPlatformStatement => ({
  platform: "airmenu",
  documentKind: "airmenu_saft",
  documentNumber: "SAFT-2026-09",
  periodFrom: "2026-09-01",
  periodTo: "2026-09-30",
  issuedOn: null,
  ordersCount,
  lines: [{ kind: "sales", label: "s", grossCents: 1, vatCents: 0, date: "2026-09-10" }],
  payouts: [],
  products,
  netPayoutCents: 1,
  id: "s",
  fileName: "f",
  importedBy: null,
  importedAt: "",
});

describe("suggestTarget / productKey", () => {
  it("nomes do AirMenu × fichas e artigos: «&», letras repetidas, XS, «Focaccia de …», upgrade, bebidas", () => {
    expect(productKey("Chicken &amp; Cheese")).toBe("chicken e cheese");
    expect(suggestTarget("Honey Pepperoni", 100, dishes, items)).toMatchObject({ targetType: "dish", pizzaId: "p1", size: "small" });
    expect(suggestTarget("Tomate e Pesto ", 100, dishes, items)).toMatchObject({ pizzaId: "p2" });
    expect(suggestTarget("Focaccia de Brigadeiro XS", 100, dishes, items)).toMatchObject({ pizzaId: "p3", size: "xs" });
    expect(suggestTarget("Upgrade para L (20/25 cm)", 100, dishes, items)).toMatchObject({ targetType: "upgrade_large" });
    expect(suggestTarget("Coca-cola Zero 33cl", 100, dishes, items)).toMatchObject({ targetType: "item", stockItemId: "i1" });
    expect(suggestTarget("Coca-cola 33cl", 100, dishes, items)).toMatchObject({ stockItemId: "i2" });
    expect(suggestTarget("Promocao", 0, dishes, items)).toMatchObject({ targetType: "ignore" });
    expect(suggestTarget("Agua mineral 51cl", 100, dishes, items)).toBeNull();
  });
});

describe("computeFoodCost", () => {
  it("pizza pequena + upgrade (Grande − Pequena), bebidas, embalagem por pizza e por pedido; sem correspondência estima-se", () => {
    const r = computeFoodCost(
      2026,
      9,
      [
        saft(
          [
            product("Honey Pepperoni", 3, 3000),
            product("Tomate e Pesto", 1, 1000),
            product("Upgrade para L (20/25 cm)", 2, 400),
            product("Coca-cola Zero 33cl", 2, 300),
            product("Agua mineral 51cl", 1, 300),
            product("Fora do mês", 1, 999, "2026-10-01"),
          ],
          3,
        ),
      ],
      [],
      dishes,
      items,
    );
    // Upgrade: média (350 − 200) × 3 e (150 − 100) × 1 → 125 por upgrade.
    expect(r.lines.find((l) => l.description.startsWith("Upgrade"))).toMatchObject({ unitCostCents: 125, costCents: 250 });
    expect(r.productsCostCents).toBe(600 + 100 + 250 + 130);
    expect(r.revenueNetCents).toBe(5000);
    expect(r.costedRevenueNetCents).toBe(4700);
    expect(r.extrapolatedCostCents).toBe(Math.round((1080 * 300) / 4700));
    // Caixa S: 4 pizzas − 2 upgrades; caixa L: 2; saco e guardanapo por pedido (3).
    expect(r.packaging.map((p) => [p.item?.name, p.quantity, p.costCents])).toEqual([
      ["Caixa S", 2, 80],
      ["Caixa L", 2, 120],
      ["Sacolas Delivery", 3, 84],
      ["Guardanapo Delivery", 3, 6],
    ]);
    expect(r.totalCostCents).toBe(1080 + r.extrapolatedCostCents + 290);
    expect(r.foodCostPct).toBe(Math.round((r.totalCostCents / 5000) * 1000) / 10);
    expect(r.complete).toBe(false);
    expect(r.warnings[0]).toMatch(/1 produto\(s\) sem correspondência/);
  });

  it("mapeamento gravado manda; embalagem com preço de pacote avisa", () => {
    const mappings: ProductMapping[] = [
      { productKey: "agua mineral 51cl", productCode: "W1", productDescription: "Agua mineral 51cl", targetType: "item", pizzaId: null, size: null, stockItemId: "i2" },
      { productKey: "@napkin", productCode: null, productDescription: "Guardanapo", targetType: "item", pizzaId: null, size: null, stockItemId: "i1" },
    ];
    const pricey = items.map((i) => (i.stockItemId === "b3" ? { ...i, unitCostCents: 399 } : i));
    const r = computeFoodCost(2026, 9, [saft([product("Agua mineral 51cl", 1, 300)], 1)], mappings, dishes, pricey);
    expect(r.lines[0]!.target).toMatchObject({ targetType: "item", stockItemId: "i2", source: "manual" });
    expect(r.packaging.find((p) => p.key === "@napkin")!.item).toMatchObject({ name: "Coca Cola Zero 33cl", source: "manual" });
    expect(r.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/Sacolas Delivery» custa 3\.99 € por unidade/)]));
  });

  it("sem SAF-T: sem produtos e aviso", () => {
    const r = computeFoodCost(2026, 9, [], [], dishes, items);
    expect(r).toMatchObject({ hasProducts: false, foodCostPct: null });
    expect(r.warnings).toEqual([expect.stringMatching(/Sem SAF-T/)]);
  });
});

describe("buildMarginReport com o custo real", () => {
  const uber: StoredPlatformStatement = {
    platform: "uber_eats",
    documentKind: "uber_monthly_statement",
    documentNumber: "U",
    periodFrom: "2026-09-01",
    periodTo: "2026-09-30",
    issuedOn: null,
    ordersCount: 1,
    lines: [{ kind: "sales", label: "Vendas", grossCents: 11500, vatCents: 0 }],
    payouts: [],
    netPayoutCents: 11500,
    id: "u",
    fileName: "f",
    importedBy: null,
    importedAt: "",
  };
  it("completo: usa a % real; incompleto: fica nos 30% e diz a % parcial", () => {
    const real = buildMarginReport(2026, 9, [uber], [uber], { pct: 25, complete: true });
    expect(real).toMatchObject({ foodCostPct: 25, foodCostSource: "real" });
    expect(real.total.foodCostCents).toBe(2500);
    const partial = buildMarginReport(2026, 9, [uber], [uber], { pct: 33.1, complete: false });
    expect(partial).toMatchObject({ foodCostPct: 30, foodCostSource: "estimate" });
    expect(partial.warnings.at(-1)).toMatch(/incompleto \(33,1% com os dados atuais\)/);
  });
});

describe("SaveProductMappingsUseCase", () => {
  const organizationId = mintOrganizationId("org-a");
  const repo = () => {
    const calls: { saved: ProductMapping[]; removed: string[] } = { saved: [], removed: [] };
    const port: ProductMappingRepositoryPort = {
      list: async () => [],
      save: async (_o, m) => void calls.saved.push(...m),
      remove: async (_o, k) => void calls.removed.push(...k),
    };
    return { port, calls };
  };

  it("normaliza a chave, grava e apaga (volta à sugestão)", async () => {
    const { port, calls } = repo();
    await new SaveProductMappingsUseCase(port).execute({
      organizationId,
      updatedBy: null,
      changes: [
        { productKey: "Cookies and Cream", productCode: "W9", productDescription: "Cookies and Cream", targetType: "dish", pizzaId: "p3", size: "small" },
        { productKey: "Agua mineral 51cl", productCode: "W8", productDescription: "Agua mineral 51cl", targetType: null },
        { productKey: "@box_small", productCode: null, productDescription: "Caixa S", targetType: "item", stockItemId: "b1" },
      ],
    });
    expect(calls.saved.map((m) => [m.productKey, m.targetType, m.pizzaId, m.size, m.stockItemId])).toEqual([
      ["cookies and cream", "dish", "p3", "small", null],
      ["@box_small", "item", null, null, "b1"],
    ]);
    expect(calls.removed).toEqual(["agua mineral 51cl"]);
  });

  it("recusa prato sem tamanho e embalagem que não é artigo", async () => {
    const { port } = repo();
    const uc = new SaveProductMappingsUseCase(port);
    await expect(
      uc.execute({ organizationId, updatedBy: null, changes: [{ productKey: "x", productCode: null, productDescription: "X", targetType: "dish", pizzaId: "p1" }] }),
    ).rejects.toBeInstanceOf(InvalidProductMappingError);
    await expect(
      uc.execute({ organizationId, updatedBy: null, changes: [{ productKey: "@bag", productCode: null, productDescription: "Saco", targetType: "ignore" }] }),
    ).rejects.toThrow(/embalagem/);
  });
});
