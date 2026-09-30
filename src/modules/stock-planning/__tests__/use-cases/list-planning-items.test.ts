import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ListPlanningItemsUseCase } from "../../application/use-cases/list-planning-items.use-case.js";
import { FakeForecastRunRepository } from "../fakes/fake-forecast-run-repository.js";
import { FakePendingPurchaseReviewRead } from "../fakes/fake-pending-purchase-review-read.js";
import { FakePlanningAlertRepository } from "../fakes/fake-planning-alert-repository.js";
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
  const useCase = new ListPlanningItemsUseCase(stockItemPlanningRead, stockQuantityRead, forecastRunRepo, planningAlertRepo, pendingPurchaseReviewRead, stockCountSignalRead);
  return { stockItemPlanningRead, stockQuantityRead, forecastRunRepo, useCase };
}

describe("ListPlanningItemsUseCase", () => {
  it("sem run nenhum ainda, devolve os itens com dados insuficientes (secção 91) — nunca inventa projeção", async () => {
    const deps = makeUseCase();
    deps.stockItemPlanningRead.items = [
      { id: "tomate", name: "Tomate", categoryId: "c1", baseUnit: "kg", isActive: true, minStockQty: 0, safetyStockQty: null, purchaseReferenceUnitCostWithoutVat: null },
    ];
    deps.stockQuantityRead.quantities.set("tomate", { stockItemId: "tomate", currentQuantity: 10, lastPurchaseUnitCostWithoutVat: null });

    const rows = await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.coverageDays).toBeNull();
    expect(rows[0]?.confidence).toBe("baixa");
    expect(rows[0]?.riskLevel).toBe("ok");
  });

  it("filtra por categoria e por pesquisa de texto", async () => {
    const deps = makeUseCase();
    deps.stockItemPlanningRead.items = [
      { id: "tomate", name: "Tomate", categoryId: "c1", baseUnit: "kg", isActive: true, minStockQty: 0, safetyStockQty: null, purchaseReferenceUnitCostWithoutVat: null },
      { id: "farinha", name: "Farinha", categoryId: "c2", baseUnit: "kg", isActive: true, minStockQty: 0, safetyStockQty: null, purchaseReferenceUnitCostWithoutVat: null },
    ];
    const rows = await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, categoryId: "c1" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Tomate");
  });
});
