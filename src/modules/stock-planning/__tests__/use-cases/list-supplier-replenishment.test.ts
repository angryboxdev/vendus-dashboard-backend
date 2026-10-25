import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ForecastRun } from "../../domain/entities/forecast-run.js";
import { ListSupplierReplenishmentUseCase } from "../../application/use-cases/list-supplier-replenishment.use-case.js";
import type { ReplenishmentRecommendationRow } from "../../domain/ports/out/forecast-run-repository.port.js";
import type { StockItemPlanningSnapshot } from "../../domain/ports/out/stock-item-planning-read.port.js";
import { FakeForecastRunRepository } from "../fakes/fake-forecast-run-repository.js";
import { FakeStockItemPlanningRead } from "../fakes/fake-stock-item-planning-read.js";
import { FakeStockQuantityRead } from "../fakes/fake-stock-quantity-read.js";
import { FakeSupplierReplenishmentRead } from "../fakes/fake-supplier-replenishment-read.js";

const ORG = mintOrganizationId("org-test");
const LOCATION = "loc-1";
const SUPPLIER = "sup-1";

function item(id: string, name: string, minStockQty = 0): StockItemPlanningSnapshot {
  return { id, name, categoryId: "cat-beb", baseUnit: "un", isActive: true, minStockQty, safetyStockQty: null, purchaseReferenceUnitCostWithoutVat: null };
}

function rec(stockItemId: string, supplierId: string | null, suggestedBaseQty: number): ReplenishmentRecommendationRow {
  return {
    stockItemId, supplierId, stockNow: 0, projectedAtWindow: null, targetStock: 0, safetyStock: 0,
    suggestedBaseQty, suggestedPurchaseQty: suggestedBaseQty / 6, purchaseUnit: "Pack 6", estimatedCost: null, confidence: "media", explanationData: {},
  };
}

async function seedRun(repo: FakeForecastRunRepository, recommendations: ReplenishmentRecommendationRow[]) {
  const run = ForecastRun.start({
    organizationId: ORG, locationId: LOCATION, dataCutoffAt: new Date("2026-09-28T23:59:59Z"),
    horizonStart: "2026-09-29", horizonEnd: "2026-10-12", modelName: "weekday_seasonal_baseline", modelVersion: "1.0.0",
  });
  await repo.insertRun(ORG, run);
  await repo.saveRunResult({ organizationId: ORG, run: run.complete(0.8), demandPoints: [], stockRequirements: [], recommendations });
}

function makeUseCase() {
  const items = new FakeStockItemPlanningRead();
  const quantities = new FakeStockQuantityRead();
  const runs = new FakeForecastRunRepository();
  const read = new FakeSupplierReplenishmentRead();
  const useCase = new ListSupplierReplenishmentUseCase(items, quantities, runs, read);
  return { items, quantities, runs, read, useCase };
}

describe("ListSupplierReplenishmentUseCase", () => {
  it("sem compras nem recomendações deste fornecedor devolve lista vazia", async () => {
    const d = makeUseCase();
    d.items.items = [item("agua", "Água 1L", 24)];
    expect(await d.useCase.execute({ organizationId: ORG, supplierId: SUPPLIER, locationId: LOCATION })).toEqual([]);
  });

  it("junta artigos comprados ao fornecedor e os que a previsão lhe atribui; ignora os de outro fornecedor", async () => {
    const d = makeUseCase();
    d.items.items = [item("agua", "Água 1L", 24), item("cola", "Refrigerante 33cl", 24), item("vinho", "Vinho 75cl", 6)];
    d.read.purchasesBySupplier.set(SUPPLIER, [
      { stockItemId: "agua", lastPurchaseDate: "2026-09-12", lastUnitCostWithoutVat: 0.89, supplierItemCode: "AG001", purchaseUnit: "Pack 6" },
    ]);
    await seedRun(d.runs, [rec("cola", SUPPLIER, 48), rec("vinho", "outro", 12)]);
    d.read.categories.set("cat-beb", "Bebidas");
    d.read.consumption.set("agua", 36);
    d.quantities.quantities.set("agua", { stockItemId: "agua", currentQuantity: 12, lastPurchaseUnitCostWithoutVat: null });

    const rows = await d.useCase.execute({ organizationId: ORG, supplierId: SUPPLIER, locationId: LOCATION });

    expect(rows.map((r) => r.stockItemId).sort()).toEqual(["agua", "cola"]);
    const agua = rows.find((r) => r.stockItemId === "agua")!;
    expect(agua).toMatchObject({
      code: "AG001", categoryName: "Bebidas", currentQuantity: 12, minStockQty: 24, consumption30d: 36,
      suggestedBaseQty: 12, suggestionSource: "min_stock", lastUnitPrice: 0.89, needsReplenishment: true,
    });
    const cola = rows.find((r) => r.stockItemId === "cola")!;
    expect(cola).toMatchObject({ suggestedBaseQty: 48, suggestedPurchaseQty: 8, purchaseUnit: "Pack 6", suggestionSource: "forecast" });
  });
});
