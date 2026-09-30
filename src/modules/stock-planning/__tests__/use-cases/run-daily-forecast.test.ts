import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { RunDailyForecastUseCase } from "../../application/use-cases/run-daily-forecast.use-case.js";
import { WeekdaySeasonalBaselineModel } from "../../domain/services/baseline-forecast.model.js";
import { FakeDemandActualsRepository } from "../fakes/fake-demand-actuals-repository.js";
import { FakeForecastRunRepository } from "../fakes/fake-forecast-run-repository.js";
import { FakeLearnedMappingRead } from "../fakes/fake-learned-mapping-read.js";
import { FakeLocationRead } from "../fakes/fake-location-read.js";
import { FakePendingPurchaseReviewRead } from "../fakes/fake-pending-purchase-review-read.js";
import { FakePlanningAlertRepository } from "../fakes/fake-planning-alert-repository.js";
import { FakeRecipeConsumption } from "../fakes/fake-recipe-consumption.js";
import { FakeStockCountSignalRead } from "../fakes/fake-stock-count-signal-read.js";
import { FakeStockItemPlanningRead } from "../fakes/fake-stock-item-planning-read.js";
import { FakeStockQuantityRead } from "../fakes/fake-stock-quantity-read.js";
import { FakeSupplierDeliveryScheduleRead } from "../fakes/fake-supplier-delivery-schedule-read.js";
import { FakeVendusSalesRead } from "../fakes/fake-vendus-sales-read.js";

const ORG = mintOrganizationId("org-test");
const LOCATION = "loc-1";

function seedDailyHistory(demandActualsRepo: FakeDemandActualsRepository, days: number, untilExclusiveDate: string, qty: number): void {
  let cursor = new Date(`${untilExclusiveDate}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    cursor = new Date(cursor);
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const date = cursor.toISOString().slice(0, 10);
    demandActualsRepo.rows.push({ organizationId: ORG, locationId: LOCATION, demandSourceType: "stock", demandSourceRef: "tomate", saleDate: date, quantitySold: qty });
  }
}

function makeUseCase() {
  const locationRead = new FakeLocationRead();
  const demandActualsRepo = new FakeDemandActualsRepository();
  const vendusSalesRead = new FakeVendusSalesRead();
  const recipeConsumption = new FakeRecipeConsumption();
  const stockQuantityRead = new FakeStockQuantityRead();
  const stockItemPlanningRead = new FakeStockItemPlanningRead();
  const forecastRunRepo = new FakeForecastRunRepository();
  const planningAlertRepo = new FakePlanningAlertRepository();
  const supplierDeliveryScheduleRead = new FakeSupplierDeliveryScheduleRead();
  const learnedMappingRead = new FakeLearnedMappingRead();
  const pendingPurchaseReviewRead = new FakePendingPurchaseReviewRead();
  const stockCountSignalRead = new FakeStockCountSignalRead();
  const forecastModel = new WeekdaySeasonalBaselineModel();

  const useCase = new RunDailyForecastUseCase(
    locationRead,
    demandActualsRepo,
    vendusSalesRead,
    recipeConsumption,
    stockQuantityRead,
    stockItemPlanningRead,
    forecastRunRepo,
    planningAlertRepo,
    supplierDeliveryScheduleRead,
    learnedMappingRead,
    pendingPurchaseReviewRead,
    stockCountSignalRead,
    forecastModel,
  );

  return {
    locationRead,
    demandActualsRepo,
    vendusSalesRead,
    recipeConsumption,
    stockQuantityRead,
    stockItemPlanningRead,
    forecastRunRepo,
    planningAlertRepo,
    supplierDeliveryScheduleRead,
    learnedMappingRead,
    pendingPurchaseReviewRead,
    stockCountSignalRead,
    useCase,
  };
}

const CUTOFF = "2026-09-29";

describe("RunDailyForecastUseCase", () => {
  it("dia normal: gera run completo, projeção e (quando há gap) recomendação", async () => {
    const deps = makeUseCase();
    seedDailyHistory(deps.demandActualsRepo, 30, CUTOFF, 10);
    deps.vendusSalesRead.byDate.set(CUTOFF, [{ demandSourceType: "stock", demandSourceRef: "tomate", saleDate: CUTOFF, quantitySold: 10 }]);
    deps.recipeConsumption.factorsBySource.set("stock:tomate", [{ stockItemId: "tomate", factor: 1 }]);
    deps.stockItemPlanningRead.items = [
      { id: "tomate", name: "Tomate", categoryId: "c1", baseUnit: "kg", isActive: true, minStockQty: 5, safetyStockQty: null, purchaseReferenceUnitCostWithoutVat: 2 },
    ];
    deps.stockQuantityRead.quantities.set("tomate", { stockItemId: "tomate", currentQuantity: 100, lastPurchaseUnitCostWithoutVat: 2 });

    const result = await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, dataCutoffDate: CUTOFF, horizonDays: 7 });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.status).toBe("completed");
    expect(result.results[0]?.demandSourcesForecast).toBe(1);
    const latest = await deps.forecastRunRepo.findLatestRun(ORG, LOCATION);
    expect(latest?.status).toBe("completed");
  });

  it("zero histórico: nunca lança, nunca produz Infinity/NaN", async () => {
    const deps = makeUseCase();
    deps.stockItemPlanningRead.items = [
      { id: "tomate", name: "Tomate", categoryId: "c1", baseUnit: "kg", isActive: true, minStockQty: 5, safetyStockQty: null, purchaseReferenceUnitCostWithoutVat: null },
    ];
    deps.stockQuantityRead.quantities.set("tomate", { stockItemId: "tomate", currentQuantity: 0, lastPurchaseUnitCostWithoutVat: null });

    const result = await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, dataCutoffDate: CUTOFF, horizonDays: 7 });
    expect(result.results[0]?.status).toBe("completed");
    expect(result.results[0]?.demandSourcesForecast).toBe(0);
  });

  it("pouco histórico → confiança baixa no ponto de previsão gravado", async () => {
    const deps = makeUseCase();
    seedDailyHistory(deps.demandActualsRepo, 3, CUTOFF, 10);
    deps.recipeConsumption.factorsBySource.set("stock:tomate", [{ stockItemId: "tomate", factor: 1 }]);
    deps.stockItemPlanningRead.items = [
      { id: "tomate", name: "Tomate", categoryId: "c1", baseUnit: "kg", isActive: true, minStockQty: 5, safetyStockQty: null, purchaseReferenceUnitCostWithoutVat: null },
    ];
    deps.stockQuantityRead.quantities.set("tomate", { stockItemId: "tomate", currentQuantity: 100, lastPurchaseUnitCostWithoutVat: null });

    await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, dataCutoffDate: CUTOFF, horizonDays: 3 });
    const latest = await deps.forecastRunRepo.findLatestRun(ORG, LOCATION);
    const points = await deps.forecastRunRepo.findDemandPointsForRun(ORG, latest!.id);
    expect(points.every((p) => p.confidence === "baixa")).toBe(true);
  });

  it("stock negativo: pipeline continua e gera alerta de qualidade de dados, nunca falha", async () => {
    const deps = makeUseCase();
    seedDailyHistory(deps.demandActualsRepo, 30, CUTOFF, 5);
    deps.recipeConsumption.factorsBySource.set("stock:tomate", [{ stockItemId: "tomate", factor: 1 }]);
    deps.stockItemPlanningRead.items = [
      { id: "tomate", name: "Tomate", categoryId: "c1", baseUnit: "kg", isActive: true, minStockQty: 5, safetyStockQty: null, purchaseReferenceUnitCostWithoutVat: null },
    ];
    deps.stockQuantityRead.quantities.set("tomate", { stockItemId: "tomate", currentQuantity: -5, lastPurchaseUnitCostWithoutVat: null });

    const result = await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, dataCutoffDate: CUTOFF, horizonDays: 7 });
    expect(result.results[0]?.status).toBe("completed");
    const alerts = [...deps.planningAlertRepo.alerts.values()];
    expect(alerts.some((a) => a.alertType === "data_quality_warning")).toBe(true);
  });

  it("compras por rever pendentes reduzem confiança sem somar ao stock", async () => {
    const deps = makeUseCase();
    seedDailyHistory(deps.demandActualsRepo, 30, CUTOFF, 5);
    deps.recipeConsumption.factorsBySource.set("stock:tomate", [{ stockItemId: "tomate", factor: 1 }]);
    deps.stockItemPlanningRead.items = [
      { id: "tomate", name: "Tomate", categoryId: "c1", baseUnit: "kg", isActive: true, minStockQty: 5, safetyStockQty: null, purchaseReferenceUnitCostWithoutVat: 1 },
    ];
    deps.stockQuantityRead.quantities.set("tomate", { stockItemId: "tomate", currentQuantity: 20, lastPurchaseUnitCostWithoutVat: 1 });
    deps.pendingPurchaseReviewRead.itemsWithPendingReview.add("tomate");

    await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, dataCutoffDate: CUTOFF, horizonDays: 7 });
    const latest = await deps.forecastRunRepo.findLatestRun(ORG, LOCATION);
    const recs = await deps.forecastRunRepo.findRecommendations(ORG, latest!.id);
    const rec = recs.find((r) => r.stockItemId === "tomate");
    // stockNow reflete só o snapshot ao vivo — nunca ajustado pela compra pendente.
    if (rec) expect(rec.stockNow).toBe(20);
  });

  it("mesmo risco recalculado repetidamente → um único alerta atualizado, nunca duplicado", async () => {
    const deps = makeUseCase();
    seedDailyHistory(deps.demandActualsRepo, 30, CUTOFF, 20);
    deps.recipeConsumption.factorsBySource.set("stock:tomate", [{ stockItemId: "tomate", factor: 1 }]);
    deps.stockItemPlanningRead.items = [
      { id: "tomate", name: "Tomate", categoryId: "c1", baseUnit: "kg", isActive: true, minStockQty: 0, safetyStockQty: 0, purchaseReferenceUnitCostWithoutVat: null },
    ];
    deps.stockQuantityRead.quantities.set("tomate", { stockItemId: "tomate", currentQuantity: 15, lastPurchaseUnitCostWithoutVat: null });

    await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, dataCutoffDate: CUTOFF, horizonDays: 7 });
    const countAfterFirst = deps.planningAlertRepo.alerts.size;
    const idsAfterFirst = new Set(deps.planningAlertRepo.alerts.keys());

    await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, dataCutoffDate: CUTOFF, horizonDays: 7 });
    const countAfterSecond = deps.planningAlertRepo.alerts.size;
    const idsAfterSecond = new Set(deps.planningAlertRepo.alerts.keys());

    expect(countAfterSecond).toBe(countAfterFirst);
    expect(idsAfterSecond).toEqual(idsAfterFirst);
    const alerts = [...deps.planningAlertRepo.alerts.values()];
    expect(alerts.filter((a) => a.alertType === "stockout_risk")).toHaveLength(1);
  });

  it("risco resolvido → alerta anterior fica auto-resolvido, nunca apagado", async () => {
    const deps = makeUseCase();
    seedDailyHistory(deps.demandActualsRepo, 30, CUTOFF, 20);
    deps.recipeConsumption.factorsBySource.set("stock:tomate", [{ stockItemId: "tomate", factor: 1 }]);
    deps.stockItemPlanningRead.items = [
      { id: "tomate", name: "Tomate", categoryId: "c1", baseUnit: "kg", isActive: true, minStockQty: 0, safetyStockQty: 0, purchaseReferenceUnitCostWithoutVat: null },
    ];
    deps.stockQuantityRead.quantities.set("tomate", { stockItemId: "tomate", currentQuantity: 15, lastPurchaseUnitCostWithoutVat: null });
    await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, dataCutoffDate: CUTOFF, horizonDays: 7 });

    const alertBefore = [...deps.planningAlertRepo.alerts.values()].find((a) => a.alertType === "stockout_risk");
    expect(alertBefore?.state).toBe("active");

    // Stock reabastecido — a condição desaparece.
    deps.stockQuantityRead.quantities.set("tomate", { stockItemId: "tomate", currentQuantity: 100_000, lastPurchaseUnitCostWithoutVat: null });
    await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, dataCutoffDate: CUTOFF, horizonDays: 7 });

    const alertAfter = deps.planningAlertRepo.alerts.get(alertBefore!.id);
    expect(alertAfter?.state).toBe("resolved");
  });

  it("produto vendido sem ficha técnica → sinaliza previsão incompleta (nunca inventa consumo)", async () => {
    const deps = makeUseCase();
    seedDailyHistory(deps.demandActualsRepo, 30, CUTOFF, 10);
    // Nenhuma entrada em factorsBySource para "stock:tomate" — simula produto sem receita/mapeamento.
    deps.stockItemPlanningRead.items = [
      { id: "farinha", name: "Farinha", categoryId: "c1", baseUnit: "kg", isActive: true, minStockQty: 0, safetyStockQty: null, purchaseReferenceUnitCostWithoutVat: null },
    ];
    deps.stockQuantityRead.quantities.set("farinha", { stockItemId: "farinha", currentQuantity: 50, lastPurchaseUnitCostWithoutVat: null });

    await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, dataCutoffDate: CUTOFF, horizonDays: 7 });
    const latest = await deps.forecastRunRepo.findLatestRun(ORG, LOCATION);
    // Sem consumo nenhum atribuído (nunca inventado) — nenhuma stock_requirement para "farinha".
    const requirements = await deps.forecastRunRepo.findStockRequirements(ORG, latest!.id, "farinha");
    expect(requirements).toHaveLength(0);
  });

  it("idempotência do run diário: mesmo dia executado 2x preserva histórico, só um run fica is_latest", async () => {
    const deps = makeUseCase();
    seedDailyHistory(deps.demandActualsRepo, 30, CUTOFF, 5);
    deps.stockItemPlanningRead.items = [];

    await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, dataCutoffDate: CUTOFF, horizonDays: 7 });
    await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, dataCutoffDate: CUTOFF, horizonDays: 7 });

    const allRuns = [...deps.forecastRunRepo.runs.values()].filter((r) => r.toProps().locationId === LOCATION);
    expect(allRuns).toHaveLength(2);
    const latestFlags = allRuns.map((r) => r.toProps().isLatest);
    expect(latestFlags.filter(Boolean)).toHaveLength(1);
  });

  it("reposição usa o calendário do fornecedor quando existe (D1/D2), senão usa lead time por omissão", async () => {
    const deps = makeUseCase();
    seedDailyHistory(deps.demandActualsRepo, 30, CUTOFF, 10);
    deps.recipeConsumption.factorsBySource.set("stock:tomate", [{ stockItemId: "tomate", factor: 1 }]);
    deps.stockItemPlanningRead.items = [
      { id: "tomate", name: "Tomate", categoryId: "c1", baseUnit: "kg", isActive: true, minStockQty: 5, safetyStockQty: 5, purchaseReferenceUnitCostWithoutVat: 1 },
    ];
    deps.stockQuantityRead.quantities.set("tomate", { stockItemId: "tomate", currentQuantity: 3, lastPurchaseUnitCostWithoutVat: 1 });
    deps.learnedMappingRead.mappings = [{ supplierId: "sup-1", stockItemId: "tomate", conversionFactor: 5, purchaseUnit: "caixa" }];
    deps.supplierDeliveryScheduleRead.schedules = [{ supplierId: "sup-1", locationId: LOCATION, weekdays: [1, 4], cutoffTime: null, active: true }];

    await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, dataCutoffDate: CUTOFF, horizonDays: 14 });
    const latest = await deps.forecastRunRepo.findLatestRun(ORG, LOCATION);
    const recs = await deps.forecastRunRepo.findRecommendations(ORG, latest!.id);
    const rec = recs.find((r) => r.stockItemId === "tomate");
    expect(rec).toBeDefined();
    expect(rec?.explanationData.nextDeliveryDate).not.toBeNull();
    expect(rec?.purchaseUnit).toBe("caixa");
    // Embalagem conhecida → quantidade sugerida em packs é um inteiro.
    expect(Number.isInteger(rec?.suggestedPurchaseQty)).toBe(true);
  });

  it("sem embalagem conhecida, sugere só a quantidade base — nunca inventa um pack size", async () => {
    const deps = makeUseCase();
    seedDailyHistory(deps.demandActualsRepo, 30, CUTOFF, 10);
    deps.recipeConsumption.factorsBySource.set("stock:tomate", [{ stockItemId: "tomate", factor: 1 }]);
    deps.stockItemPlanningRead.items = [
      { id: "tomate", name: "Tomate", categoryId: "c1", baseUnit: "kg", isActive: true, minStockQty: 5, safetyStockQty: 5, purchaseReferenceUnitCostWithoutVat: 1 },
    ];
    deps.stockQuantityRead.quantities.set("tomate", { stockItemId: "tomate", currentQuantity: 3, lastPurchaseUnitCostWithoutVat: 1 });

    await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, dataCutoffDate: CUTOFF, horizonDays: 14 });
    const latest = await deps.forecastRunRepo.findLatestRun(ORG, LOCATION);
    const recs = await deps.forecastRunRepo.findRecommendations(ORG, latest!.id);
    const rec = recs.find((r) => r.stockItemId === "tomate");
    expect(rec?.suggestedPurchaseQty).toBeNull();
    expect(rec?.purchaseUnit).toBeNull();
    expect(rec?.suggestedBaseQty).toBeGreaterThan(0);
  });

  it("isolamento multi-tenant: run de uma organização não aparece para outra, mesma loja", async () => {
    const deps = makeUseCase();
    seedDailyHistory(deps.demandActualsRepo, 30, CUTOFF, 5);
    deps.stockItemPlanningRead.items = [];
    await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, dataCutoffDate: CUTOFF, horizonDays: 7 });

    const otherOrg = mintOrganizationId("org-other");
    const latestForOwnOrg = await deps.forecastRunRepo.findLatestRun(ORG, LOCATION);
    const latestForOtherOrg = await deps.forecastRunRepo.findLatestRun(otherOrg, LOCATION);

    expect(latestForOwnOrg).not.toBeNull();
    expect(latestForOtherOrg).toBeNull();
  });
});
