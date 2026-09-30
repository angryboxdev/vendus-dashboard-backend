import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ForecastRun } from "../../domain/entities/forecast-run.js";
import { NoLatestForecastRunError } from "../../domain/errors.js";
import { GeneratePurchaseListUseCase } from "../../application/use-cases/generate-purchase-list.use-case.js";
import { FakeForecastRunRepository } from "../fakes/fake-forecast-run-repository.js";
import { FakeStockItemPlanningRead } from "../fakes/fake-stock-item-planning-read.js";
import { FakeSupplierNameRead } from "../fakes/fake-supplier-name-read.js";

const ORG = mintOrganizationId("org-test");
const LOCATION = "loc-1";

async function seedCompletedRun(forecastRunRepo: FakeForecastRunRepository): Promise<void> {
  const run = ForecastRun.start({
    organizationId: ORG,
    locationId: LOCATION,
    dataCutoffAt: new Date(),
    horizonStart: "2026-09-30",
    horizonEnd: "2026-10-13",
    modelName: "weekday_seasonal_baseline",
    modelVersion: "1.0.0",
  });
  await forecastRunRepo.insertRun(ORG, run);
  const completed = run.complete(0.9);
  await forecastRunRepo.saveRunResult({
    organizationId: ORG,
    run: completed,
    demandPoints: [],
    stockRequirements: [],
    recommendations: [
      {
        stockItemId: "tomate",
        supplierId: "sup-1",
        stockNow: 3,
        projectedAtWindow: -2,
        targetStock: 20,
        safetyStock: 5,
        suggestedBaseQty: 22,
        suggestedPurchaseQty: 3,
        purchaseUnit: "caixa",
        estimatedCost: 22,
        confidence: "alta",
        explanationData: {},
      },
    ],
  });
}

function makeUseCase() {
  const forecastRunRepo = new FakeForecastRunRepository();
  const stockItemPlanningRead = new FakeStockItemPlanningRead();
  stockItemPlanningRead.items = [
    { id: "tomate", name: "Tomate", categoryId: "c1", baseUnit: "kg", isActive: true, minStockQty: 0, safetyStockQty: null, purchaseReferenceUnitCostWithoutVat: 1 },
  ];
  const supplierNameRead = new FakeSupplierNameRead();
  supplierNameRead.namesById.set("sup-1", "Frescos Lda");
  const useCase = new GeneratePurchaseListUseCase(forecastRunRepo, stockItemPlanningRead, supplierNameRead);
  return { forecastRunRepo, stockItemPlanningRead, supplierNameRead, useCase };
}

describe("GeneratePurchaseListUseCase", () => {
  it("agrupa por fornecedor e nunca gera um estado de pedido", async () => {
    const deps = makeUseCase();
    await seedCompletedRun(deps.forecastRunRepo);

    const list = await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION });
    expect(list.groups).toHaveLength(1);
    expect(list.groups[0]?.supplierName).toBe("Frescos Lda");
    expect(list.groups[0]?.lines[0]?.itemName).toBe("Tomate");
  });

  it("gerar a lista 2x não duplica as recomendações (mesmo run)", async () => {
    const deps = makeUseCase();
    await seedCompletedRun(deps.forecastRunRepo);

    const first = await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION });
    const second = await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION });

    expect(first.runId).toBe(second.runId);
    expect(second.groups[0]?.lines).toHaveLength(1);
  });

  it("sem run nenhum ainda, lança erro em vez de inventar uma lista", async () => {
    const deps = makeUseCase();
    await expect(deps.useCase.execute({ organizationId: ORG, locationId: LOCATION })).rejects.toThrow(NoLatestForecastRunError);
  });
});
