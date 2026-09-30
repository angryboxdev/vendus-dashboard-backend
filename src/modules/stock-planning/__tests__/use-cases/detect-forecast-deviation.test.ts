import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ForecastRun } from "../../domain/entities/forecast-run.js";
import { DetectForecastDeviationUseCase } from "../../application/use-cases/detect-forecast-deviation.use-case.js";
import { FakeDemandActualsRepository } from "../fakes/fake-demand-actuals-repository.js";
import { FakeForecastFeedbackRepository } from "../fakes/fake-forecast-feedback-repository.js";
import { FakeForecastRunRepository } from "../fakes/fake-forecast-run-repository.js";
import { FakeLocationRead } from "../fakes/fake-location-read.js";

const ORG = mintOrganizationId("org-test");
const LOCATION = "loc-1";
const PERIOD = "2026-09-29";

function makeUseCase() {
  const locationRead = new FakeLocationRead();
  const forecastRunRepo = new FakeForecastRunRepository();
  const demandActualsRepo = new FakeDemandActualsRepository();
  const forecastFeedbackRepo = new FakeForecastFeedbackRepository();
  const useCase = new DetectForecastDeviationUseCase(locationRead, forecastRunRepo, demandActualsRepo, forecastFeedbackRepo);
  return { locationRead, forecastRunRepo, demandActualsRepo, forecastFeedbackRepo, useCase };
}

async function seedRunCoveringPeriod(forecastRunRepo: FakeForecastRunRepository, forecastValue: number): Promise<void> {
  const run = ForecastRun.start({
    organizationId: ORG,
    locationId: LOCATION,
    dataCutoffAt: new Date("2026-09-28T23:59:59Z"),
    horizonStart: PERIOD,
    horizonEnd: "2026-10-05",
    modelName: "weekday_seasonal_baseline",
    modelVersion: "1.0.0",
  });
  await forecastRunRepo.insertRun(ORG, run);
  const completed = run.complete(0.8);
  await forecastRunRepo.saveRunResult({
    organizationId: ORG,
    run: completed,
    demandPoints: [{ demandSourceType: "stock", demandSourceRef: "tomate", forecastDate: PERIOD, predictedQuantity: forecastValue, confidence: "alta" }],
    stockRequirements: [],
    recommendations: [],
  });
}

describe("DetectForecastDeviationUseCase", () => {
  it("desvio material (% e absoluto) → cria exatamente 1 feedback", async () => {
    const deps = makeUseCase();
    await seedRunCoveringPeriod(deps.forecastRunRepo, 100);
    deps.demandActualsRepo.rows.push({ organizationId: ORG, locationId: LOCATION, demandSourceType: "stock", demandSourceRef: "tomate", saleDate: PERIOD, quantitySold: 160 });

    const result = await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, periodDate: PERIOD });
    expect(result[0]?.feedbackCreated).toBe(true);
    expect(deps.forecastFeedbackRepo.feedback.size).toBe(1);
  });

  it("ruído — desvio percentual grande mas impacto absoluto irrelevante → sem feedback", async () => {
    const deps = makeUseCase();
    await seedRunCoveringPeriod(deps.forecastRunRepo, 2);
    deps.demandActualsRepo.rows.push({ organizationId: ORG, locationId: LOCATION, demandSourceType: "stock", demandSourceRef: "tomate", saleDate: PERIOD, quantitySold: 4 });

    const result = await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, periodDate: PERIOD, absoluteThreshold: 50 });
    expect(result[0]?.feedbackCreated).toBe(false);
    expect(deps.forecastFeedbackRepo.feedback.size).toBe(0);
  });

  it("reprocessar a mesma anomalia não duplica o feedback", async () => {
    const deps = makeUseCase();
    await seedRunCoveringPeriod(deps.forecastRunRepo, 100);
    deps.demandActualsRepo.rows.push({ organizationId: ORG, locationId: LOCATION, demandSourceType: "stock", demandSourceRef: "tomate", saleDate: PERIOD, quantitySold: 160 });

    await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, periodDate: PERIOD });
    const secondResult = await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, periodDate: PERIOD });

    expect(secondResult[0]?.feedbackCreated).toBe(false);
    expect(deps.forecastFeedbackRepo.feedback.size).toBe(1);
  });

  it("sem run a cobrir o período, não inventa dados — sem feedback", async () => {
    const deps = makeUseCase();
    const result = await deps.useCase.execute({ organizationId: ORG, locationId: LOCATION, periodDate: PERIOD });
    expect(result[0]?.feedbackCreated).toBe(false);
    expect(deps.forecastFeedbackRepo.feedback.size).toBe(0);
  });
});
