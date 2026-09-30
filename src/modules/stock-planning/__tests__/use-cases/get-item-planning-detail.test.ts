import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ForecastRun } from "../../domain/entities/forecast-run.js";
import { NoLatestForecastRunError, StockItemPlanningNotFoundError } from "../../domain/errors.js";
import { GetItemPlanningDetailUseCase } from "../../application/use-cases/get-item-planning-detail.use-case.js";
import { FakeForecastRunRepository } from "../fakes/fake-forecast-run-repository.js";
import { FakePendingPurchaseReviewRead } from "../fakes/fake-pending-purchase-review-read.js";
import { FakePlanningAlertRepository } from "../fakes/fake-planning-alert-repository.js";
import { FakeRecipeConsumption } from "../fakes/fake-recipe-consumption.js";
import { FakeStockCountSignalRead } from "../fakes/fake-stock-count-signal-read.js";
import { FakeStockItemPlanningRead } from "../fakes/fake-stock-item-planning-read.js";
import { FakeStockQuantityRead } from "../fakes/fake-stock-quantity-read.js";

const ORG = mintOrganizationId("org-test");
const LOCATION = "loc-1";

function makeUseCase() {
  const stockItemPlanningRead = new FakeStockItemPlanningRead();
  const stockQuantityRead = new FakeStockQuantityRead();
  const forecastRunRepo = new FakeForecastRunRepository();
  const planningAlertRepo = new FakePlanningAlertRepository();
  const pendingPurchaseReviewRead = new FakePendingPurchaseReviewRead();
  const stockCountSignalRead = new FakeStockCountSignalRead();
  const recipeConsumption = new FakeRecipeConsumption();
  const useCase = new GetItemPlanningDetailUseCase(
    stockItemPlanningRead,
    stockQuantityRead,
    forecastRunRepo,
    planningAlertRepo,
    pendingPurchaseReviewRead,
    stockCountSignalRead,
    recipeConsumption,
  );
  return { stockItemPlanningRead, stockQuantityRead, forecastRunRepo, recipeConsumption, useCase };
}

describe("GetItemPlanningDetailUseCase", () => {
  it("item inexistente lança erro", async () => {
    const deps = makeUseCase();
    await expect(deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, stockItemId: "missing" })).rejects.toThrow(StockItemPlanningNotFoundError);
  });

  it("sem run ainda para a loja, lança erro em vez de inventar detalhe", async () => {
    const deps = makeUseCase();
    deps.stockItemPlanningRead.items = [
      { id: "tomate", name: "Tomate", categoryId: "c1", baseUnit: "kg", isActive: true, minStockQty: 0, safetyStockQty: null, purchaseReferenceUnitCostWithoutVat: null },
    ];
    await expect(deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, stockItemId: "tomate" })).rejects.toThrow(NoLatestForecastRunError);
  });

  it("com run existente, devolve projeção e produtos afetados sem dupla contagem", async () => {
    const deps = makeUseCase();
    deps.stockItemPlanningRead.items = [
      { id: "tomate", name: "Tomate", categoryId: "c1", baseUnit: "kg", isActive: true, minStockQty: 0, safetyStockQty: null, purchaseReferenceUnitCostWithoutVat: null },
    ];
    deps.stockQuantityRead.quantities.set("tomate", { stockItemId: "tomate", currentQuantity: 50, lastPurchaseUnitCostWithoutVat: null });
    deps.recipeConsumption.factorsBySource.set("pizza:margherita:small", [{ stockItemId: "tomate", factor: 0.1 }]);
    deps.recipeConsumption.factorsBySource.set("pizza:diavola:large", [{ stockItemId: "tomate", factor: 0.2 }]);

    const run = ForecastRun.start({
      organizationId: ORG,
      locationId: LOCATION,
      dataCutoffAt: new Date(),
      horizonStart: "2026-09-30",
      horizonEnd: "2026-10-05",
      modelName: "m",
      modelVersion: "1",
    });
    await deps.forecastRunRepo.insertRun(ORG, run);
    await deps.forecastRunRepo.saveRunResult({
      organizationId: ORG,
      run: run.complete(0.9),
      demandPoints: [
        { demandSourceType: "pizza", demandSourceRef: "margherita:small", forecastDate: "2026-09-30", predictedQuantity: 10, confidence: "alta" },
        { demandSourceType: "pizza", demandSourceRef: "diavola:large", forecastDate: "2026-09-30", predictedQuantity: 5, confidence: "alta" },
      ],
      stockRequirements: [{ stockItemId: "tomate", forecastDate: "2026-09-30", expectedConsumption: 2, cumulativeConsumption: 2 }],
      recommendations: [],
    });

    const detail = await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, stockItemId: "tomate" });
    expect(detail.affectedProducts).toHaveLength(2);
    const total = detail.affectedProducts.reduce((sum, p) => sum + p.contributedQty, 0);
    expect(total).toBeCloseTo(1 * 0.1 * 10 + 0.2 * 5, 6);
  });
});
